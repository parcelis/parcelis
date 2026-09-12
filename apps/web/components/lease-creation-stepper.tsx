"use client";

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
  value?: string;
};

export function LeaseCreationStepper({ onValueChange, value }: LeaseCreationStepperProps) {
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
            <StepperItem className="max-md:items-start" key={step.id} stepId={step.id}>
              <StepperTrigger>
                <StepperIndicator>{index + 1}</StepperIndicator>
                <div className="flex flex-col items-start justify-center">
                  <StepperTitle>{step.title}</StepperTitle>
                  <StepperDescription className="text-nowrap">{step.description}</StepperDescription>
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
