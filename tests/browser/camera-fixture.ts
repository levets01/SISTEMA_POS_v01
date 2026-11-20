import type { Page } from '@playwright/test'
// EAN-8 patterns from the symbology. Frames run through the production ZXing decoder.
export async function installTestCamera(page: Page) {
  await page.addInitScript(() => {
    const left = [
      '0001101',
      '0011001',
      '0010011',
      '0111101',
      '0100011',
      '0110001',
      '0101111',
      '0111011',
      '0110111',
      '0001011',
    ]
    let code = ''
    addEventListener('fixture-barcode', (e) => {
      code = (e as CustomEvent<string>).detail
    })
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 360
        const ctx = canvas.getContext('2d')!
        function draw() {
          ctx.fillStyle = 'white'
          ctx.fillRect(0, 0, 640, 360)
          if (!code) return
          const bits =
            '101' +
            code
              .slice(0, 4)
              .split('')
              .map((n) => left[Number(n)])
              .join('') +
            '01010' +
            code
              .slice(4)
              .split('')
              .map((n) => left[Number(n)].replace(/[01]/g, (b) => (b === '0' ? '1' : '0')))
              .join('') +
            '101'
          ctx.fillStyle = 'black'
          ;[...bits].forEach((b, i) => {
            if (b === '1') ctx.fillRect(119 + 6 * i, 70, 6, 220)
          })
        }
        draw()
        const stream = canvas.captureStream(15)
        const ticker = setInterval(() => {
          if (stream.active) draw()
          else clearInterval(ticker)
        }, 60)
        return stream
      },
    })
  })
}
