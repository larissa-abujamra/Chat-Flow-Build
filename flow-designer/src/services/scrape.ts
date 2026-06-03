export interface ScrapeResult {
  companyName: string
  description: string
  products: Array<{ name: string; price: string | null }>
}

/**
 * Scrapes company info from a URL.
 *
 * Mock by default. To wire a real backend:
 * 1. Set VITE_SCRAPE_API_URL in .env (NEVER expose API keys in frontend code)
 * 2. Uncomment the fetch block below and implement the server-side route
 */
export async function scrapeCompany(_url: string): Promise<ScrapeResult> {
  // Real backend seam — keep API keys on the server side only:
  //
  // const apiUrl = import.meta.env.VITE_SCRAPE_API_URL
  // if (apiUrl) {
  //   const res = await fetch(`${apiUrl}/scrape`, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ url: _url }),
  //   })
  //   if (!res.ok) throw new Error(`Scrape failed: ${res.status}`)
  //   return res.json() as Promise<ScrapeResult>
  // }

  await new Promise((r) => setTimeout(r, 1200))

  return {
    companyName: 'Empresa Mockada',
    description: 'Uma empresa que vende produtos incríveis.',
    products: [
      { name: 'Produto A', price: 'R$ 49,90' },
      { name: 'Produto B', price: 'R$ 89,90' },
      { name: 'Produto C', price: null },
    ],
  }
}
