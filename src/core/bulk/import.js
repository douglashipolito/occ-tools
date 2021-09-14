const winston = require('winston');
var os = require('os');
const fs = require('fs-extra');
const path = require('path');
const cTable = require('console.table');

const { sleep, formatDuration } = require('../utils');

module.exports = async (occ, importId, file, format, mode) => {

  winston.info(`Started ${importId} import process for file ${file}...`);
  const importedFile = await occ.promisedRequest({
    api: 'files',
    method: 'post',
    formData: {
      filename: path.basename(file),
      uploadType: 'bulkImport',
      fileUpload: fs.createReadStream(file)
    }
  });

  if (!importedFile.success || !importedFile.result.hadSuccess) {
    throw new Error('Error upload the file to OCC');
  } else if (importedFile.result.fileResults.find(f => !f.success)) {
    throw new Error('Error upload the file to OCC');
  }

  winston.info(`File ${file} uploaded to OCC, starting import process...`);

  const newProcess = await occ.promisedRequest({
    api: 'importProcess',
    method: 'post',
    body: {
      id: importId,
      format,
      fileName: path.basename(file),
      mode
    }
  });

  if (!newProcess.status === 'submitted') {
    throw new Error(`Unable to start the bulk import process [status=${newProcess.status}]`);
  }

  let importStatus = {};
  const importURL = `importProcess/${newProcess.processId}`;

  winston.info(`Import process ${newProcess.processId} started with status ${newProcess.status}...`);

  while (!importStatus.completed) {
    importStatus = await occ.promisedRequest(importURL);
    if (!importStatus.completed) {
      await sleep(5000);
    }
  }

  winston.info('Import process finished with status %s', importStatus.progress);

  winston.info('Downloading import report');
  const reportURL = importStatus.links.find(l => l.rel === 'meta').href;
  const report = await occ.promisedRequest({ url: reportURL, method: 'get' });

  const formattedReport = [{
    'Items': report.successCount + report.failureCount,
    'Succees': report.successCount,
    'Failure': report.failureCount,
    'Started': new Date(report.startTime).toLocaleString(),
    'Ended': new Date(report.endTime).toLocaleString(),
    'Duration': formatDuration(report.startTime, report.endTime)
  }];

  console.table(formattedReport);

  if (report.failureExceptions.length) {
    report.failureExceptions.forEach(e => winston.error(e.message));
    const reportPath = path.join(os.tmpdir(), `bulk-import-${newProcess.processId}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    winston.info('Full report stored at %s', reportPath);
  }
};

