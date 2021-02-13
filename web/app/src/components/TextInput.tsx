import React from "https://cdn.skypack.dev/react@17.0.1?dts";

import "./TextInput.css";

interface TextInputProps {
  name: string;
  value?: string;
  paddingTop?: "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7";
  onChange?(value: string): void;
  autoComplete?: string;
  invalid?: boolean;
}

export const TextInput = ({
  value,
  name,
  autoComplete,
  invalid,
  onChange,
  paddingTop,
}: TextInputProps) => (
  <input
    className={`TextInput ${invalid ? "--invalid" : ""}`}
    style={{
      ...(paddingTop ? { marginTop: `var(--${paddingTop})` } : {}),
    }}
    type="text"
    name={name}
    id={`${name}-text-input`}
    value={value}
    autoComplete={autoComplete ?? "off"}
    autoCorrect="off"
    onChange={(e) => {
      if (typeof onChange === "function") {
        onChange(e.target.value);
      }
    }}
  />
);