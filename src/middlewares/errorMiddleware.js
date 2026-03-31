const notFound = (req, res, next) => {
  res.status(404).json({
    message: `Route not found: ${req.originalUrl}`,
  });
};

const errorHandler = (err, req, res, next) => {
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
};

module.exports = {
  notFound,
  errorHandler,
};