import { useState } from "react";
import {
  App,
  Button,
  Checkbox,
  Dock,
  email,
  FieldError,
  Footer,
  Form,
  Header,
  Input,
  Label,
  minLength,
  PasswordInput,
  pattern,
  required,
  ValidationSummary,
  VBox,
  View,
} from "../src/index.ts";

function SignupForm() {
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);

  const handleExit = () => {
    App.instance?.stop();
    process.exit(0);
  };

  return (
    <Dock style={{ background: "$background" }}>
      <Header>📝 ZTUI Form Validation Demo</Header>
      <Footer>Tab: Next Field │ Enter on a field-less button submits │ Errors show inline</Footer>

      <VBox style={{ padding: 2, width: 50 }}>
        {/*
          messageMode="inline" pairs each field with a <FieldError/> that takes
          zero rows until its field is invalid — friendly to small terminals.
          Switch to the default "auto" to instead share one bottom status line.
        */}
        <Form
          messageMode="inline"
          onSubmit={(values) => setSubmitted(values)}
          style={{ border: "round", padding: 1 }}
        >
          <Label style={{ color: "$success" }}>Username</Label>
          <Input
            id="username"
            icon="👤"
            placeholder="at least 3 characters"
            validateOn="blur"
            validators={[required("Username is required"), minLength(3)]}
            style={{ background: "$panel", color: "$accent" }}
          />
          <FieldError targetId="username" style={{ color: "$error" }} />

          <Label style={{ color: "$success" }}>Email</Label>
          <Input
            id="email"
            icon="✉️"
            type="email"
            placeholder="you@example.com"
            validateOn="blur"
            validators={[required("Email is required"), email()]}
            style={{ background: "$panel", color: "$accent" }}
          />
          <FieldError targetId="email" style={{ color: "$error" }} />

          <Label style={{ color: "$success" }}>Password</Label>
          <PasswordInput
            id="password"
            placeholder="8+ chars, 1 number"
            validateOn="blur"
            validators={[
              required("Password is required"),
              minLength(8, "Use at least 8 characters"),
              pattern(/\d/, "Include at least one number"),
            ]}
            style={{ background: "$panel", color: "$accent" }}
          />
          <FieldError targetId="password" style={{ color: "$error" }} />

          {/* Boolean field: required() treats `false` as empty → "must accept". */}
          <Checkbox
            id="terms"
            label=" I accept the terms"
            validateOn="change"
            validators={[required("You must accept the terms")]}
          />
          <FieldError targetId="terms" style={{ color: "$error" }} />

          <View style={{ height: 1 }} />
          {/* Roll-up of every error; ↑/↓ + Enter jumps to a field. Zero rows when valid. */}
          <ValidationSummary title="Please fix:" style={{ width: "100%" }} />

          <View style={{ height: 1 }} />
          <Button formAction="submit" style={{ background: "$success" }}>
            Create Account
          </Button>
        </Form>

        <View style={{ height: 1 }} />
        {submitted ? (
          <Label style={{ color: "$success" }}>✅ Submitted: {JSON.stringify(submitted)}</Label>
        ) : (
          <Label style={{ color: "$dimmed" }}>Fill the form and submit…</Label>
        )}

        <View style={{ height: 1 }} />
        <Button style={{ background: "$error" }} onClick={handleExit}>
          Exit
        </Button>
      </VBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const formDemo: Demo = {
  id: "form",
  title: "Form Validation",
  group: "Forms",
  description: "Validated signup form.",
  Component: SignupForm,
};
