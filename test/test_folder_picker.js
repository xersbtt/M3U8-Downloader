import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

async function testFormsDialog() {
  console.log('Testing Windows Forms FolderBrowserDialog (Nested STA)...');
  const command = `powershell -NoProfile -ExecutionPolicy Bypass -Command "
    $code = {
      Add-Type -AssemblyName System.Windows.Forms;
      $dialog = New-Object System.Windows.Forms.FolderBrowserDialog;
      $dialog.Description = 'Test Forms Dialog';
      if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        Write-Output $dialog.SelectedPath;
      }
    };
    powershell -NoProfile -STA -Command $code
  "`;
  try {
    const { stdout } = await execPromise(command);
    console.log('Result (Forms):', stdout.trim());
  } catch (err) {
    console.error('Error (Forms):', err);
  }
}

async function testComDialog() {
  console.log('\nTesting COM Shell.Application BrowseForFolder...');
  const command = `powershell -NoProfile -ExecutionPolicy Bypass -Command "
    $shell = New-Object -ComObject Shell.Application;
    $folder = $shell.BrowseForFolder(0, 'Chọn thư mục lưu trữ', 0, 0);
    if ($folder) {
      Write-Output $folder.Self.Path;
    }
  "`;
  try {
    const { stdout } = await execPromise(command);
    console.log('Result (COM):', stdout.trim());
  } catch (err) {
    console.error('Error (COM):', err);
  }
}

async function main() {
  await testFormsDialog();
  await testComDialog();
}

main().catch(console.error);
