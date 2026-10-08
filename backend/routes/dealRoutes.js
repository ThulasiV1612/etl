const express = require('express')
const { listDealsHandler } = require('../controllers/dealController')

const router = express.Router()

router.get('/', listDealsHandler)

module.exports = router
