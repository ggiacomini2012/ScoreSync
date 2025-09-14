import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        try:
            # 1. Navigate to the app
            await page.goto("http://localhost:9002")

            # 2. Upload the sample music file
            # The input is hidden, but Playwright can still find it and set files
            file_input = page.locator('input[type="file"]')
            await file_input.set_input_files("jules-scratch/verification/sample.musicxml")

            # 3. Wait for the score to be visible
            score_container = page.locator(".score-container")
            await expect(score_container).to_be_visible(timeout=30000) # 30s timeout for loading

            # 4. Take a screenshot after loading
            await page.screenshot(path="jules-scratch/verification/verification_loaded.png")

            # 5. Interact with the controls
            # Change the tempo
            tempo_slider = page.get_by_role("slider")
            await expect(tempo_slider).to_be_visible()

            # To "drag" a slider, we can calculate the target position on the slider's bounding box
            slider_box = await tempo_slider.bounding_box()
            if slider_box:
                await page.mouse.move(slider_box['x'] + slider_box['width'] * 0.2, slider_box['y'] + slider_box['height'] / 2)
                await page.mouse.down()
                await page.mouse.move(slider_box['x'] + slider_box['width'] * 0.8, slider_box['y'] + slider_box['height'] / 2)
                await page.mouse.up()

            # Click the play button
            play_button = page.get_by_role("button", name="Play")
            await expect(play_button).to_be_enabled(timeout=20000) # Wait for piano to load
            await play_button.click()

            # 6. Wait for a moment to let the cursor appear
            await page.wait_for_timeout(1000)

            # 7. Take a final screenshot
            await page.screenshot(path="jules-scratch/verification/verification_playing.png")

            print("Verification script completed successfully.")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="jules-scratch/verification/verification_error.png")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
