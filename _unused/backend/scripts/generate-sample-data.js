/**
 * Generates sample Excel file and placeholder images for local testing.
 * Run: node scripts/generate-sample-data.js
 */
const fs = require('fs')
const path = require('path')
const xlsx = require('xlsx')

const root = path.join(__dirname, '..')
const imagesDir = path.join(root, 'images')
const sampleDir = path.join(root, 'sample-data')

if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true })
if (!fs.existsSync(sampleDir)) fs.mkdirSync(sampleDir, { recursive: true })

const rows = [
  {
    'Deal ID': 'DEAL001',
    'Investor Name': 'John Smith',
    Email: 'john.smith@example.com',
    'Investment Amount': 50000,
  },
  {
    'Deal ID': 'DEAL002',
    'Investor Name': 'Jane Doe',
    Email: 'jane.doe@example.com',
    'Investment Amount': 75000,
  },
  {
    'Deal ID': 'DEAL003',
    'Investor Name': 'Bob Wilson',
    Email: 'bob.wilson@example.com',
    'Investment Amount': 120000,
  },
  {
    'Deal ID': 'DEAL004',
    'Investor Name': 'Alice Brown',
    Email: 'alice.brown@example.com',
    'Investment Amount': 30000,
  },
]

const worksheet = xlsx.utils.json_to_sheet(rows)
const workbook = xlsx.utils.book_new()
xlsx.utils.book_append_sheet(workbook, worksheet, 'Investors')

const excelPath = path.join(sampleDir, 'investors-sample.xlsx')
xlsx.writeFile(workbook, excelPath)

// DEAL001 and DEAL003 have images; DEAL002 and DEAL004 intentionally missing
const imageDeals = ['DEAL001', 'DEAL003']
imageDeals.forEach((dealId) => {
  const imagePath = path.join(imagesDir, `${dealId}.jpg`)
  fs.writeFileSync(imagePath, `placeholder image for ${dealId}`)
})

console.log(`Sample Excel: ${excelPath}`)
console.log(`Images created: ${imageDeals.map((d) => d + '.jpg').join(', ')}`)
console.log('Missing images (for error testing): DEAL002.jpg, DEAL004.jpg')
