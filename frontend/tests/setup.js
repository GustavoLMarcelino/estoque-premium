import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// O jsdom não implementa rolagem; os componentes chamam essas duas funções.
Element.prototype.scrollIntoView = vi.fn()
window.scrollTo = vi.fn()

afterEach(() => {
  cleanup()
  localStorage.clear()
})
