import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  it('defaults to type="button"', () => {
    render(<Button>送信</Button>)
    expect(screen.getByRole('button', { name: '送信' })).toHaveAttribute('type', 'button')
  })

  it('lets an explicit type override the default', () => {
    render(<Button type="submit">送信</Button>)
    expect(screen.getByRole('button', { name: '送信' })).toHaveAttribute('type', 'submit')
  })
})
