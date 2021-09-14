var intervalToDuration = require('date-fns/intervalToDuration');
var formatDuration = require('date-fns/formatDuration');

module.exports = (start, end) => {
  const elapsedMs = end - start;

  if (elapsedMs < 1000) {
    return `${elapsedMs} milliseconds`;
  }

  const options = { format: ['days', 'hours', 'minutes'] };
  if (elapsedMs < 60000) {
    options.format = ['seconds'];
  }

  const duration = intervalToDuration({ start, end });
  return formatDuration(duration, options);
};
