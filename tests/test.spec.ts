import { expect, test } from '@playwright/test'

test('SSR', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: '@jill64/sveltekit-adapter-aws' })
  ).toBeVisible()
})

test('SPA', async ({ page }) => {
  await page.goto('/csr')
  await expect(page.getByRole('heading', { name: 'CSR' })).toBeVisible()

  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: '@jill64/sveltekit-adapter-aws' })
  ).toBeVisible()
})

test('CSR', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: '@jill64/sveltekit-adapter-aws' })
  ).toBeVisible()

  await page.goto('/csr')
  await expect(page.getByRole('heading', { name: 'CSR' })).toBeVisible()
})

test('SSG', async ({ page }) => {
  await page.goto('/ssg')
  await expect(page.getByRole('heading', { name: 'SSG' })).toBeVisible()

  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: '@jill64/sveltekit-adapter-aws' })
  ).toBeVisible()
})

test('SSG Routing', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: '@jill64/sveltekit-adapter-aws' })
  ).toBeVisible()

  await page.goto('/ssg')
  await expect(page.getByRole('heading', { name: 'SSG' })).toBeVisible()
})
