const { listDeals } = require('../services/dealService')

async function listDealsHandler(_req, res) {
  try {
    const deals = await listDeals()
    return res.json({ deals })
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to load deals',
      message: error.message,
    })
  }
}

module.exports = {
  listDealsHandler,
}
