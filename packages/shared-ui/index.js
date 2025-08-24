const path = require('path');

module.exports = {
  // Export path to main stylesheet
  mainStylesheet: path.join(__dirname, 'style.css'),
  
  // Utility function to get stylesheet content
  getStyles: () => {
    const fs = require('fs');
    return fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  }
};
