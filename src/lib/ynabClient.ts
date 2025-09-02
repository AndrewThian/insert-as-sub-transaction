import "dotenv/config"
import * as ynab from "ynab"

const token = process.env.YNAB_ACCESS_TOKEN
if (!token) {
    throw new Error("Undefined YNAB_ACCESS_TOKEN")
}

export const ynabClient = new ynab.API(token)
