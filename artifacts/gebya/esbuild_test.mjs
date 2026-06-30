import esbuild from 'esbuild';
import fs from 'fs';
const code = fs.readFileSync('D:/Gebya-Notebook-Addis/artifacts/gebya/src/components/TransactionForm.jsx', 'utf8');
try {
  esbuild.transformSync(code, { loader: 'jsx', jsx: 'automatic' });
  console.log('Transform OK');
} catch(e) {
  console.log('Line:', e.location?.line, 'Col:', e.location?.column, 'Msg:', e.message);
}
