import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Panel switches to valid Simplified Chinese through Settings', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Settings' }).click();
    await panel.getByRole('tab', { name: 'AI' }).click();
    const languageSelects = panel.locator('.settings-panel select');
    await languageSelects.nth(1).selectOption('zh-CN');
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(panel.getByRole('button', { name: '社交' })).toBeVisible();
    await expect(panel.getByText(/设置|偏好/).first()).toBeVisible();
    await expect(panel.getByText('已保存，尚未配置 API 密钥。')).toBeVisible();
    await panel.locator('.workspace').evaluate((workspace) => workspace.scrollTo({ top: 0 }));
    await device.screenshot(panel, 'zh-CN/settings-1180.png');
    await panel.getByRole('button', { name: '主页' }).click();
    await expect(panel.getByTestId('panel-page-home')).toHaveAttribute('data-motion-state', 'entered');
    await expect(panel.getByText('伙伴的状态')).toBeVisible();
    await device.screenshot(panel, 'zh-CN/home-1180.png');
  } finally { await device.close(); }
});
