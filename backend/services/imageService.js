const fs = require('fs')
const path = require('path')
const { logAudit } = require('./logger')

const imagesDir = path.join(__dirname, '..', 'images')
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

function findImageForDeal(dealId) {
  for (const ext of SUPPORTED_EXTENSIONS) {
    const imagePath = path.join(imagesDir, `${dealId}${ext}`)
    if (fs.existsSync(imagePath)) {
      return {
        found: true,
        imagePath,
        imageFileName: `${dealId}${ext}`,
      }
    }
  }

  return { found: false, imagePath: null, imageFileName: null }
}

function matchImage(dealId) {
  const result = findImageForDeal(dealId)

  if (result.found) {
    logAudit(`Image matched for ${dealId}`)
  }

  return result
}

function ensureImagesDir() {
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true })
  }
}

ensureImagesDir()

module.exports = {
  matchImage,
  findImageForDeal,
}
