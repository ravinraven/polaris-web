import { test, expect, Page } from '@playwright/test';

// Only the nodes on screen: the tree that is not being shown stays in the page, hidden
function shown(page: Page, name: string) {
    return page.locator('[data-pw=node]:visible', { hasText: name }).first();
}

test("can expand directories", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId('node').filter({ hasText: 'Khemmis' }).getByTestId('toggle').click();
    await expect(page.getByText('Three Gates')).toBeVisible();
});

test("opens through folders that only hold one folder", async ({ page }) => {
    await page.goto("/");
    // Khemmis has no files, only Hunted, which is opened for us
    await page.getByTestId('node').filter({ hasText: 'Khemmis' }).getByTestId('toggle').click();
    await expect(page.getByText('Hunted', { exact: true })).toBeVisible();
    await expect(page.getByText('Three Gates')).toBeVisible();
});

test("does not open folders when there is a choice between several", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId('node').filter({ hasText: 'Tobokegao' }).getByTestId('toggle').click();
    await expect(page.getByTestId('node').filter({ hasText: 'Picnic (Remixes)' })).toBeVisible();
    await expect(page.getByText('Birthday Party')).not.toBeVisible();
});

test("can filter by file extension", async ({ page }) => {
    const filter = page.getByPlaceholder('filter');
    await page.goto("/");
    await filter.fill('.mp3');
    await expect(shown(page, 'Khemmis')).toBeVisible();
    await expect(shown(page, 'Tobokegao')).toBeVisible();

    await filter.fill('ext:flac');
    await expect(page.getByText('No files match this filter.')).toBeVisible();

    // The extension is the end of the name, not any part of the path
    await filter.fill('ext:mp');
    await expect(page.getByText('No files match this filter.')).toBeVisible();
});

test("can filter by folder name", async ({ page }) => {
    const filter = page.getByPlaceholder('filter');
    await page.goto("/");
    await filter.fill('dir:hunt');
    await expect(shown(page, 'Khemmis')).toBeVisible();
    await expect(shown(page, 'Tobokegao')).toBeHidden();

    // A file name is not a folder name
    await filter.fill('dir:gates');
    await expect(page.getByText('No files match this filter.')).toBeVisible();
});

test("can combine extension and folder filters", async ({ page }) => {
    const filter = page.getByPlaceholder('filter');
    await page.goto("/");
    await filter.fill('dir:picnic .mp3');
    await expect(shown(page, 'Tobokegao')).toBeVisible();
    await expect(shown(page, 'Khemmis')).toBeHidden();

    await filter.fill('dir:picnic .flac');
    await expect(page.getByText('No files match this filter.')).toBeVisible();
});

test("can double click to queue a song", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId('clear-playlist').click({ force: true });
    await page.getByTestId('node').filter({ hasText: 'Khemmis' }).getByTestId('toggle').click();
    await page.getByText('Three Gates').click({ clickCount: 2 });
    await expect(page.getByTestId('playlist-song')).toHaveCount(1);
});

test("can drag and drop a song to playlist", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId('clear-playlist').click({ force: true });
    await page.getByTestId('node').filter({ hasText: 'Khemmis' }).getByTestId('toggle').click();
    await page.getByText('Three Gates').dragTo(page.getByTestId('playlist-songs'));
    await expect(page.getByTestId('playlist-song')).toHaveCount(1);
});

test("can drag and drop a directory to playlist", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId('clear-playlist').click({ force: true });
    await page.getByTestId('node').filter({ hasText: 'Khemmis' }).dragTo(page.getByTestId('playlist-songs'));
    await expect(page.getByTestId('playlist-song')).toHaveCount(5);
});

test("can drag and drop multiple directories to playlist at once", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId('clear-playlist').click({ force: true });
    await page.getByTestId('node').filter({ hasText: 'Khemmis' }).click();
    await page.getByTestId('node').filter({ hasText: 'Tobokegao' }).click({ modifiers: ['Control'] });
    await page.getByTestId('node').filter({ hasText: 'Tobokegao' }).dragTo(page.getByTestId('playlist-songs'));
    await expect(page.getByTestId('playlist-song')).toHaveCount(13);
});

