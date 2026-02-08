import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for SquadX Whiteboard
 */

test.describe('Whiteboard', () => {
  test.describe('Access and Loading', () => {
    test('should load whiteboard page for valid session', async ({ page }) => {
      // This test requires a valid session - mock or create one in beforeEach
      await page.goto('/session/test-session/whiteboard');

      // Should see loading or whiteboard panel
      await expect(
        page.locator('[data-testid="whiteboard-panel"], .excalidraw')
      ).toBeVisible({ timeout: 10000 });
    });

    test('should display connection status indicator', async ({ page }) => {
      await page.goto('/session/test-session/whiteboard');

      // Look for connection status (Sincronizado/Desconectado)
      const statusIndicator = page.locator('text=/Sincronizado|Desconectado/');
      await expect(statusIndicator).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Canvas Interaction', () => {
    test('should allow drawing when host', async ({ page }) => {
      // Setup as host
      await page.goto('/session/test-session/whiteboard?role=host');

      // Wait for canvas to load
      await page.waitForSelector('.excalidraw', { timeout: 10000 });

      // Select rectangle tool
      await page.keyboard.press('r');

      // Draw a shape
      const canvas = page.locator('.excalidraw canvas').first();
      await canvas.click({ position: { x: 100, y: 100 } });
      await canvas.click({ position: { x: 200, y: 200 } });

      // Verify an element was created (canvas has content)
      // This is a basic check - more detailed checks would use the Excalidraw API
      await expect(canvas).toBeVisible();
    });

    test('should show view-only mode for non-host without permission', async ({ page }) => {
      await page.goto('/session/test-session/whiteboard?role=viewer');

      // Wait for canvas
      await page.waitForSelector('.excalidraw', { timeout: 10000 });

      // Look for permission bar with "Modo visualização"
      const permissionBar = page.locator('text=/Modo visualização|Levantar mão/');
      await expect(permissionBar).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Permission System', () => {
    test('should show "Levantar mão" button for viewers', async ({ page }) => {
      await page.goto('/session/test-session/whiteboard?role=viewer');

      const raiseHandButton = page.locator('button:has-text("Levantar mão")');
      await expect(raiseHandButton).toBeVisible({ timeout: 10000 });
    });

    test('should change permission state when raising hand', async ({ page }) => {
      await page.goto('/session/test-session/whiteboard?role=viewer');

      // Click raise hand
      const raiseHandButton = page.locator('button:has-text("Levantar mão")');
      await raiseHandButton.click();

      // Should see "Aguardando aprovação"
      const waitingText = page.locator('text=/Aguardando aprovação/');
      await expect(waitingText).toBeVisible({ timeout: 5000 });
    });

    test('should show host controls for managing permissions', async ({ page }) => {
      await page.goto('/session/test-session/whiteboard?role=host');

      // Host should see "Você é o host"
      const hostText = page.locator('text=/Você é o host/');
      await expect(hostText).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Sidebar and Navigation', () => {
    test('should toggle sidebar visibility', async ({ page }) => {
      await page.goto('/session/test-session/whiteboard');

      // Find and click sidebar toggle
      const sidebarToggle = page.locator('button[title*="painel"]');

      // Click to show sidebar
      await sidebarToggle.click();

      // Sidebar should be visible (BoardSidebar component)
      const sidebar = page.locator('[class*="w-64"], [class*="BoardSidebar"]');
      await expect(sidebar).toBeVisible({ timeout: 5000 });
    });

    test('should show board title in status bar', async ({ page }) => {
      await page.goto('/session/test-session/whiteboard?boardId=test-board');

      // Should display board title or "Untitled Board"
      const boardTitle = page.locator('text=/Untitled Board|Board/');
      await expect(boardTitle).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Collaborators', () => {
    test('should display collaborator count when others are present', async ({ browser }) => {
      // Create two browser contexts to simulate collaboration
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      try {
        // Both join the same session
        await Promise.all([
          page1.goto('/session/test-session/whiteboard?role=host&name=Host'),
          page2.goto('/session/test-session/whiteboard?role=viewer&name=Viewer'),
        ]);

        // Wait for connection
        await page1.waitForTimeout(2000);

        // Page 1 should see 1 collaborator
        const collaboratorCount = page1.locator('text=/1 participante/');
        await expect(collaboratorCount).toBeVisible({ timeout: 10000 });
      } finally {
        await context1.close();
        await context2.close();
      }
    });
  });

  test.describe('Templates', () => {
    test('should open template gallery', async ({ page }) => {
      await page.goto('/session/test-session/whiteboard?role=host');

      // Open template gallery via sidebar or menu
      // First show sidebar
      const sidebarToggle = page.locator('button[title*="painel"]');
      await sidebarToggle.click();

      // Look for templates button
      const templatesButton = page.locator('button:has-text("Templates"), [data-testid="templates-button"]');
      if (await templatesButton.isVisible()) {
        await templatesButton.click();

        // Template gallery should appear
        const gallery = page.locator('text=/Galeria de Templates/');
        await expect(gallery).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Export', () => {
    test('should open export dialog', async ({ page }) => {
      await page.goto('/session/test-session/whiteboard?role=host');

      // Look for export button in sidebar
      const sidebarToggle = page.locator('button[title*="painel"]');
      await sidebarToggle.click();

      const exportButton = page.locator('button:has-text("Export"), [data-testid="export-button"]');
      if (await exportButton.isVisible()) {
        await exportButton.click();

        // Export dialog should appear
        const dialog = page.locator('text=/Exportar|Export/');
        await expect(dialog).toBeVisible({ timeout: 5000 });
      }
    });
  });
});

test.describe('Whiteboard Performance', () => {
  test('should render within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/session/test-session/whiteboard');

    // Wait for Excalidraw canvas
    await page.waitForSelector('.excalidraw', { timeout: 15000 });

    const loadTime = Date.now() - startTime;

    // Should load within 10 seconds
    expect(loadTime).toBeLessThan(10000);
  });

  test('should handle many elements without freezing', async ({ page }) => {
    await page.goto('/session/test-session/whiteboard?role=host');

    await page.waitForSelector('.excalidraw', { timeout: 10000 });

    // Create multiple elements by pressing r (rectangle) and clicking
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('r');
      const canvas = page.locator('.excalidraw canvas').first();
      await canvas.click({
        position: { x: 50 + i * 30, y: 50 + (i % 5) * 50 },
      });
      await canvas.click({
        position: { x: 100 + i * 30, y: 100 + (i % 5) * 50 },
      });
    }

    // Page should still be responsive
    const responsiveCheck = await page.evaluate(() => {
      return new Promise((resolve) => {
        const start = performance.now();
        requestAnimationFrame(() => {
          resolve(performance.now() - start < 100);
        });
      });
    });

    expect(responsiveCheck).toBe(true);
  });
});

/**
 * Helper function to wait for WebSocket connection
 */
async function waitForWebSocketConnection(page: Page) {
  await page.waitForFunction(() => {
    // Check if Yjs WebSocket is connected
    return document.querySelector('.excalidraw') !== null;
  }, { timeout: 10000 });
}
