const path = require("path");

module.exports = {
  entry: "./static/mainapp/js/main.js",
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "./staticfiles/mainapp/js"),
  },
  mode: "production", // or 'development'
};
