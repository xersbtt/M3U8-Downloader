import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

async function testSingleLine() {
  console.log('Testing single line Windows Forms FolderBrowserDialog...');
  const command = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = 'Select Folder'; $dialog.ShowNewFolderButton = $true; if ($dialog.ShowDialog() -eq 'OK') { Write-Output $dialog.SelectedPath }"`;
  
  try {
    const { stdout } = await execPromise(command);
    console.log('Result:', stdout.trim());
  } catch (err) {
    console.error('Error:', err);
  }
}

testSingleLine().catch(console.error);
