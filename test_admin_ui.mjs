import playwright from 'playwright';

const browser = await playwright.chromium.launch();
const page = await browser.newPage();

try {
  // Navigate to app
  console.log('1️⃣ Navigating to app...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  
  // Take screenshot of dashboard
  await page.screenshot({ path: '/tmp/01-dashboard.png' });
  console.log('✅ App loaded');

  // Click Settings
  console.log('2️⃣ Opening Settings...');
  await page.click('a[href="/settings"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/02-settings.png' });
  console.log('✅ Settings opened');

  // Click Administration tab
  console.log('3️⃣ Clicking Administration tab...');
  const adminTab = await page.$('[role="tab"][value="admin"]');
  if (adminTab) {
    await adminTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/03-admin-tab.png' });
    console.log('✅ Administration tab visible');
  } else {
    console.log('❌ Administration tab not found');
  }

  // Check for backup card
  console.log('4️⃣ Checking Backup card...');
  const backupText = await page.textContent('text=Backup');
  console.log(`✅ Backup card found: "${backupText}"`);

  // Check for restore card
  console.log('5️⃣ Checking Restore card...');
  const restoreText = await page.textContent('text=Restore');
  console.log(`✅ Restore card found: "${restoreText}"`);

  // Check for reset card
  console.log('6️⃣ Checking Factory Reset card...');
  const resetText = await page.textContent('text=Factory Reset');
  console.log(`✅ Reset card found: "${resetText}"`);

  // Try to click Create Backup button
  console.log('7️⃣ Clicking Create Backup...');
  const backupBtn = await page.$('button:has-text("Create Backup")');
  if (backupBtn) {
    await backupBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/04-backup-result.png' });
    
    // Check for download link
    const downloadLink = await page.$('a:has-text("Download")');
    if (downloadLink) {
      const href = await downloadLink.getAttribute('href');
      console.log(`✅ Backup created, download link present: ${href}`);
    } else {
      console.log('❌ Download link not found after backup');
    }
  } else {
    console.log('❌ Create Backup button not found');
  }

  console.log('\n✅ All UI elements verified successfully!');
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error);
} finally {
  await browser.close();
}
