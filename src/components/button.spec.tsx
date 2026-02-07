import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Button } from './button.js';

describe('Button', () => {
  it('should render with default props', () => {
    const { getByRole } = render(<Button>Click me</Button>);
    const button = getByRole('button');

    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Click me');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('should forward ref correctly', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Click me</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('should merge custom styles with default styles', () => {
    const { getByRole } = render(<Button style={{ backgroundColor: 'red' }}>Click me</Button>);
    const button = getByRole('button');

    expect(button.style.backgroundColor).toBe('red');
    expect(button.style.display).toBe('inline-flex');
    expect(button.style.alignItems).toBe('center');
    expect(button.style.justifyContent).toBe('center');
  });

  it('should pass through additional props', () => {
    const { getByRole } = render(
      <Button data-testid="test-button" aria-label="Test Button">
        Click me
      </Button>,
    );
    const button = getByRole('button');

    expect(button).toHaveAttribute('data-testid', 'test-button');
    expect(button).toHaveAttribute('aria-label', 'Test Button');
  });
});
