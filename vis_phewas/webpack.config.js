const path = require("path");

module.exports = {
  entry: "./static/mainapp/js/main.js",
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "./staticfiles/js"),
  },
  mode: "production", // or 'development'
};
