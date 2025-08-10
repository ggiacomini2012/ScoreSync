'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function CalculatorPage() {
  const [input, setInput] = useState('0');
  const [previousInput, setPreviousInput] = useState<string | null>(null);
  const [operator, setOperator] = useState<string | null>(null);

  const handleNumberClick = (value: string) => {
    if (input === '0' && value !== '.') {
      setInput(value);
    } else if (input.includes('.') && value === '.') {
      return;
    }
    else {
      setInput(input + value);
    }
  };

  const handleOperatorClick = (op: string) => {
    if (previousInput !== null && operator) {
      handleEquals();
      setPreviousInput(input);
    } else {
      setPreviousInput(input);
    }
    setInput('0');
    setOperator(op);
  };
  
  const handleClear = () => {
    setInput('0');
    setPreviousInput(null);
    setOperator(null);
  };

  const handleEquals = () => {
    if (!operator || previousInput === null) return;

    const current = parseFloat(input);
    const previous = parseFloat(previousInput);
    let result: number;

    switch (operator) {
      case '+':
        result = previous + current;
        break;
      case '-':
        result = previous - current;
        break;
      case '*':
        result = previous * current;
        break;
      case '/':
        result = previous / current;
        break;
      default:
        return;
    }

    setInput(String(result));
    setPreviousInput(null);
    setOperator(null);
  };

  const buttons = [
    '7', '8', '9', '/',
    '4', '5', '6', '*',
    '1', '2', '3', '-',
    '0', '.', '=', '+'
  ];

  const handleButtonClick = (btn: string) => {
    if (!isNaN(parseInt(btn, 10)) || btn === '.') {
      handleNumberClick(btn);
    } else if (['+', '-', '*', '/'].includes(btn)) {
      handleOperatorClick(btn);
    } else if (btn === '=') {
      handleEquals();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <Card className="w-full max-w-sm shadow-2xl">
        <CardHeader>
          <CardTitle>Calculator</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted text-right p-4 rounded-lg mb-4 text-4xl font-mono break-all">
            {input}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Button
              className="col-span-4 text-xl"
              variant="destructive"
              onClick={handleClear}
            >
              C
            </Button>
            {buttons.map((btn) => (
              <Button
                key={btn}
                className={cn(
                  "text-2xl h-16",
                  btn === '=' ? 'col-span-2' : '',
                  ['/', '*', '-', '+'].includes(btn) ? 'bg-accent text-accent-foreground' : ''
                )}
                variant="outline"
                onClick={() => handleButtonClick(btn)}
              >
                {btn}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
