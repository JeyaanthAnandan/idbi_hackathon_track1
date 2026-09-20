# Observed IDBI sandbox response shapes

These shapes were captured from successful sandbox calls on 19 September 2026. The downloaded OpenAPI files have empty `responses` sections, so these are observed contracts and must be rechecked against the portal when the sandbox version changes.

The expanded audit now covers all 31 routes: [results and data utilisation](IDBI_SANDBOX_AUDIT.md), [observed field types for all successful scenarios](IDBI_OBSERVED_SCHEMAS.json). HTTP success alone does not validate account/consent association.

## API 394 — account discovery

```json
{
  "numOfAccounts": "1",
  "customerAccountInfo": [
    {
      "acctCurrCode": "INR",
      "acctNumber": "...",
      "acctBalance": { "amountValue": "56780.25", "currencyCode": "INR" },
      "acctType": "SBA"
    }
  ],
  "acctTypeRequested": "SBA",
  "cifId": "..."
}
```

## API 365 — account enquiry

The response includes `acctId`, `acctType`, `custId`, `personName`, `acctOpenDt`, `bankAcctStatusCode`, `bankInfo`, and `acctBal[]`. Each balance item has `balType` and `balAmt.amountValue/currencyCode`; observed types include `LEDGER`, `AVAIL`, `EFFAVL`, `LIEN`, `FLOAT`, `DRWPWR`, and `ACCBAL`.

## API 393 — direct statement

```json
{
  "result": {
    "accountBalances": {
      "acid": "...",
      "availableBalance": { "amountValue": "...", "currencyCode": "INR" },
      "ledgerBalance": { "amountValue": "...", "currencyCode": "INR" },
      "userDefinedBalance": { "amountValue": "...", "currencyCode": "INR" }
    },
    "hasMoreData": "N",
    "transactionDetails": [
      {
        "pstdDate": "2025-05-01T10:00:00.000",
        "transactionSummary": {
          "txnAmt": { "amountValue": "2448.28", "currencyCode": "INR" },
          "txnDate": "2025-05-01T00:00:00.000",
          "txnDesc": "...",
          "txnType": "D"
        },
        "txnBalance": { "amountValue": "...", "currencyCode": "INR" },
        "txnId": "...",
        "valueDate": "2025-05-01T00:00:00.000"
      }
    ]
  },
  "customData": { "THB": "49" }
}
```

`txnType` is `D` for debit and `C` for credit. `hasMoreData` controls pagination.

## API 591 — consent list

The top-level response includes `status`, `ver`, `data[]`, `timestamp`, `errorCode`, `errorMsg`, and `errors[]`. Each consent includes `consentID`, `status`, `consent_handle`, `productID`, `accountID`, `aaId`, `vua`, and `accounts[]`. Linked accounts contain `fipName`, `fipId`, `accountType`, `linkReferenceNumber`, `maskedAccountNumber`, and `fiType`.

## API 739 — FinPro account statement

The top-level response includes `ver`, `status`, and `data[]`. Each data item contains:

- `linkReferenceNumber`, `maskedAccountNumber`, `fiType`, and `bank`
- `Profile.Holders.Holder[]` with identity fields
- `Summary` with IFSC, branch, status, currency, opening date, and current balance
- `Transactions.startDate`, `Transactions.endDate`, and `Transactions.Transaction[]`

Each transaction includes `type` (`DEBIT` or `CREDIT`), `amount`, `narration`, `txnId`, `reference`, `transactionTimestamp`, `valueDate`, and `currentBalance`.

**Observed integrity failure:** the standard 591 response supplies `LRN0001`, but 739 returns a different `linkReferenceNumber`. Mitra now refuses that mismatched import. API 595 multi-account samples use `transactionalBalance` instead of `currentBalance` and include savings, current, term-deposit and salary accounts. Their published examples work individually, while fetching with the consent ID returned by multi-account 591 fails with `Data not found`.

## API 593 — redirect-result decryption

Returns `ver`, `status`, `message`, and a `data` object containing `redirect`, `sessionid`, `srcref`, `userid`, `errorcode`, `status`, `txnid`, and identity fields. This is callback/approval metadata, not a decrypted financial statement.
