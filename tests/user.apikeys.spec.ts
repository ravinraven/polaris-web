import { test, expect, Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId('sidebar').getByTestId('settings').click();
    await page.getByTestId('api-keys').click();
});

// Tests run in parallel against the same account, so each one only looks at its own key.
const uniqueLabel = () => "e2e key " + Math.random().toString(36).slice(2, 10);

const createKey = async (page: Page, label: string): Promise<string> => {
    await page.getByTestId('add-api-key').click();
    await page.getByLabel('Label').fill(label);
    await page.getByTestId('create-api-key').click();
    await expect(page.getByTestId('created-key')).toBeVisible();
    return (await page.getByTestId('new-key-value').innerText()).trim();
};

const keyRow = (page: Page, label: string) =>
    page.getByTestId('api-key').filter({ hasText: label });

test("cannot create a key without a label", async ({ page }) => {
    await page.getByTestId('add-api-key').click();
    await expect(page.getByTestId('create-api-key')).toBeDisabled();
    await page.getByLabel('Label').fill("   ");
    await expect(page.getByTestId('create-api-key')).toBeDisabled();
    await page.getByLabel('Label').fill("x");
    await expect(page.getByTestId('create-api-key')).toBeEnabled();
    await page.getByLabel('Label').fill("x".repeat(101));
    await expect(page.getByTestId('create-api-key')).toBeDisabled();
});

test("shows the new key once, then only the label", async ({ page }) => {
    const label = uniqueLabel();
    const key = await createKey(page, label);
    expect(key).toMatch(/^[0-9a-f]{64}$/);

    // Listed right away, without the secret
    await expect(keyRow(page, label)).toHaveCount(1);
    await expect(keyRow(page, label)).toContainText("Never used");
    await expect(keyRow(page, label)).not.toContainText(key);

    // Dismissing the box removes the secret from the page
    await page.getByTestId('dismiss-key').click();
    await expect(page.getByTestId('created-key')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(key);

    // It is gone after a reload, but the key itself is still listed
    await page.reload();
    await expect(keyRow(page, label)).toHaveCount(1);
    await expect(page.locator('body')).not.toContainText(key);
});

test("leaving the page discards the secret", async ({ page }) => {
    const label = uniqueLabel();
    const key = await createKey(page, label);

    await page.getByTestId('preferences').click();
    await page.getByTestId('api-keys').click();
    await expect(page.getByTestId('created-key')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(key);
    await expect(keyRow(page, label)).toHaveCount(1);
});

test("can revoke a key, after confirming", async ({ page }) => {
    const label = uniqueLabel();
    await createKey(page, label);
    await page.getByTestId('dismiss-key').click();

    const deleteRequest = page.waitForRequest(request =>
        request.method() == "DELETE" && request.url().includes('/api/api_keys/'));

    // The first click only asks for confirmation
    await keyRow(page, label).getByTestId('revoke-api-key').click();
    await expect(keyRow(page, label)).toHaveCount(1);
    await keyRow(page, label).getByTestId('confirm-revoke').click();
    await deleteRequest;
    await expect(keyRow(page, label)).toHaveCount(0);

    await page.reload();
    await expect(keyRow(page, label)).toHaveCount(0);
});
