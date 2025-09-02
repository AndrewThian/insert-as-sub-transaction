import type { NewTransaction, SaveSubTransaction } from "ynab";
import { parseCsv } from "./lib/parseCsv";
import { ynabClient } from "./lib/ynabClient";
import { select, checkbox, input } from '@inquirer/prompts';
import chalk from 'chalk';

async function execute() {
    try {
        console.log(chalk.blue.bold('🚀 Starting YNAB transaction processing...\n'));
        
        // Parse CSV data
        const csvData = await parseCsv();
        console.log(chalk.green(`✅ Loaded ${csvData.length} transactions from CSV\n`));
        
        // Get budgets
        console.log(chalk.blue.bold('📊 Fetching your YNAB budgets...\n'));
        const budgetResponse = await ynabClient.budgets.getBudgets();
        const budgets = budgetResponse.data.budgets;
        
        if (budgets.length === 0) {
            console.log(chalk.yellow('❌ No budgets found in your YNAB account.'));
            return;
        }
        
        // Transform budgets into choice format for Inquirer
        const budgetChoices = budgets.map(budget => ({
            name: `${chalk.white.bold(budget.name)} ${chalk.gray(`(${budget.currency_format?.iso_code || 'Unknown'})`)} ${chalk.dim(`- Last modified: ${new Date(budget.last_modified_on || '').toLocaleDateString()}`)}`,
            value: budget,
            description: budget.name
        }));
        
        // Interactive budget selection with arrow keys
        const selectedBudget = await select({
            message: chalk.cyan('Select a budget to continue:'),
            choices: budgetChoices,
            pageSize: 10
        });
        
        console.log(chalk.green.bold(`\n✅ Selected budget: ${selectedBudget.name}\n`));
        
        // Continue with next execution steps
        console.log(chalk.blue('🔄 Continuing with account selection and transaction processing...'));
        
        // Get accounts from selected budget
        console.log(chalk.blue.bold('💳 Fetching accounts from selected budget...\n'));
        const accountsResponse = await ynabClient.accounts.getAccounts(selectedBudget.id);
        const accounts = accountsResponse.data.accounts.filter(account => !account.deleted && !account.closed);
        
        if (accounts.length === 0) {
            console.log(chalk.yellow('❌ No active accounts found in this budget.'));
            return;
        }
        
        // Transform accounts into choice format
        const accountChoices = accounts.map(account => ({
            name: `${chalk.white.bold(account.name)} ${chalk.gray(`(${account.type})`)} ${chalk.dim(`- ${account.balance < 0 ? '-' : ''}$${Math.abs(account.balance / 1000).toFixed(2)}`)}`,
            value: account,
            description: account.name
        }));
        
        // Account selection
        const selectedAccount = await select({
            message: chalk.cyan('Select an account for transactions:'),
            choices: accountChoices,
            pageSize: 10
        });
        
        console.log(chalk.green.bold(`\n✅ Selected account: ${selectedAccount.name}\n`));
        
        // Transform CSV data into checkbox choices for multi-selection
        console.log(chalk.blue.bold('📋 Select transactions to post to YNAB...\n'));
        const csvChoices = csvData.map((transaction: any, index: number) => {
            const payee = transaction.Payee.length > 25 ? transaction.Payee.slice(0, 22) + '...' : transaction.Payee.padEnd(25);
            const memo = transaction.Memo.length > 40 ? transaction.Memo.slice(0, 37) + '...' : transaction.Memo.padEnd(40);
            
            return {
                name: `${chalk.cyan(transaction.Date)} | ${chalk.white.bold(payee)} | ${chalk.gray(memo)} | ${chalk.green('$' + transaction.Outflow)}`,
                value: { ...transaction, index },
                description: `${transaction.Date} - ${transaction.Payee} - $${transaction.Outflow}`
            };
        });
        
        // Multi-select CSV transactions
        const selectedTransactions = await checkbox({
            message: chalk.cyan('Select transactions to post: (Press <space> to select, <a> to toggle all, <i> to invert selection)'),
            choices: csvChoices,
            pageSize: 15
        });
        
        console.log(chalk.green.bold(`\n✅ Selected ${selectedTransactions.length} transactions\n`));
        
        // Display selected transactions in table format
        const tableData = selectedTransactions.map((t: any) => ({
            Date: t.Date,
            Payee: t.Payee,
            Memo: t.Memo.slice(0, 30) + (t.Memo.length > 30 ? '...' : ''),
            Amount: '$' + t.Outflow
        }));
        console.table(tableData);
        
        // Ask for parent transaction memo
        const parentMemo = await input({
            message: chalk.cyan('Enter a memo for the parent transaction:'),
            default: `Split transaction with ${selectedTransactions.length} items`
        });
        
        // Post selected transactions as subtransactions to YNAB
        console.log(chalk.blue('🔄 Posting transactions as subtransactions to YNAB...'));
        
        // Calculate total amount from selected transactions only
        const totalAmount = selectedTransactions.reduce((sum: number, t: any) => sum + parseFloat(t.Outflow.replace('$', '')), 0);
        
        // Transform CSV transactions to subtransaction format
        const subtransactions: SaveSubTransaction[] = selectedTransactions.map((transaction: any) => ({
            memo: `${transaction.Date} - ${transaction.Memo}`,
            amount: -Math.round(parseFloat(transaction.Outflow.replace('$', '')) * 1000), // YNAB uses milliunits, negative for outflow
            category_id: null // Let user assign categories in YNAB
        }));
        
        // Create parent transaction with subtransactions
        const parentTransaction: NewTransaction = {
            account_id: selectedAccount.id,
            memo: parentMemo,
            amount: -Math.round(totalAmount * 1000), // Total of selected transactions in milliunits
            date: new Date().toISOString().split('T')[0], // Use today's date
            cleared: 'uncleared' as const,
            approved: false,
            subtransactions: subtransactions
        };
        
        try {
            // Post parent transaction with subtransactions to YNAB
            await ynabClient.transactions.createTransaction(
                selectedBudget.id, 
                { transaction: parentTransaction }
            );
            
            const postedSubtransactionCount = subtransactions.length;
            console.log(chalk.green.bold(`\n🎉 Successfully posted 1 parent transaction with ${postedSubtransactionCount} subtransactions to YNAB!\n`));
            
            // Display summary
            console.log(chalk.yellow(`💰 Total amount: $${totalAmount.toFixed(2)}`));
            console.log(chalk.yellow(`📝 Parent memo: ${parentMemo}`));
            console.log(chalk.yellow(`📊 Account: ${selectedAccount.name}`));
            console.log(chalk.yellow(`🏦 Budget: ${selectedBudget.name}`));
            console.log(chalk.yellow(`🔢 Subtransactions: ${postedSubtransactionCount}`));
            
        } catch (postError) {
            console.error(chalk.red.bold('\n❌ Error posting transactions to YNAB:'));
            console.error(postError)
        } 
        
    } catch (error) {
        console.error(chalk.red.bold('\n❌ Error during execution:'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
    }
}

execute();