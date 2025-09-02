import { readFile } from 'fs/promises'
import Papa from 'papaparse'

export async function parseCsv() {
  const csvPath = 'transactions.csv'
  const csvData = await readFile(csvPath, 'utf-8')
  
  const parsed = Papa.parse(csvData, {
    header: true,
    skipEmptyLines: true
  })
  
  return parsed.data
}
