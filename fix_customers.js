const fs = require('fs');
const lines = fs.readFileSync('d:/Gebya-Notebook-Addis/artifacts/gebya/src/App.jsx', 'utf8').split(/\r?\n/);

const out = [];
let skip = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i] === '  const customerSummaries = useMemo(' && lines[i+1].includes('buildCustomerSummaries(ledgerCustomers, ledgerTransactions)')) {
    skip = true;
  }
  
  if (lines[i] === '  // Enriched customer summaries — adds on_time_count, on_time_rate, has_overdue,') {
    skip = true;
  }

  if (lines[i] === '  // Alias for backward-compat in renders below. (Already enriched up top.)') {
    // skip this and next line
    i++;
    continue;
  }

  if (skip && lines[i] === '  );') {
    if (lines[i-1] && (lines[i-1].includes('[ledgerCustomers, ledgerTransactions]') || lines[i-1].includes('[customerSummaries]'))) {
       skip = false;
       continue;
    }
  }

  if (!skip) {
    let line = lines[i];
    line = line.replace(/enrichedCustomerSummariesEarly/g, 'enrichedCustomerSummaries');
    out.push(line);
  }
}

// Remove multiple blank lines that might have been created
const finalOut = [];
for(let i=0; i<out.length; i++) {
  if (out[i] === '' && out[i-1] === '') {
    continue;
  }
  finalOut.push(out[i]);
}

fs.writeFileSync('d:/Gebya-Notebook-Addis/artifacts/gebya/src/App.jsx', finalOut.join('\n'));
