"use client";

import type { ReactNode } from "react";

import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@parcelis/ui";

export const leaseCreationSteps = [
  { id: "property", description: "Choose the property and unit", title: "Property" },
  { id: "residents", description: "Add the lease residents", title: "Residents" },
  { id: "terms", description: "Set dates, rent, and billing", title: "Terms" },
  { id: "review", description: "Confirm the lease details", title: "Review" },
];

type LeaseCreationStepperProps = {
  onValueChange?: (value: string) => void;
  saveStatus?: ReactNode;
  value?: string;
};

export function LeaseCreationStepper({ onValueChange, saveStatus, value }: LeaseCreationStepperProps) {
  return (
    <div className="flex w-full flex-col gap-6">
      <Stepper
        className="flex items-center"
        onValueChange={onValueChange}
        responsive
        steps={leaseCreationSteps}
        value={value}
      >
        <StepperNav className="max-md:items-start">
          {leaseCreationSteps.map((step, index) => (
            <StepperItem className="min-w-0 max-md:items-start" key={step.id} stepId={step.id}>
              <StepperTrigger className="min-w-0">
                <StepperIndicator>{index + 1}</StepperIndicator>
                <div className="flex min-w-0 flex-col items-start justify-center gap-1">
                  <StepperTitle>{step.title}</StepperTitle>
                  <StepperDescription className="hidden text-nowrap lg:block">{step.description}</StepperDescription>
                  <div className="mt-5 flex min-h-5 items-center gap-2 text-xs text-parcelis-gray dark:text-white/60">
                    {value === step.id ? saveStatus : null}
                  </div>
                </div>
              </StepperTrigger>
              <StepperSeparator className="max-md:hidden" />
              {index < leaseCreationSteps.length - 1 ? <StepperSeparator className="max-md:ml-4 md:hidden" /> : null}
            </StepperItem>
          ))}
        </StepperNav>
      </Stepper>
    </div>
  );
}
