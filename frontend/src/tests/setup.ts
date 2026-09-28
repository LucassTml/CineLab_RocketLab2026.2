import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// limpa o DOM entre um teste e outro
afterEach(() => cleanup())
