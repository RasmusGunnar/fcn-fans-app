import React from "react";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { AuthProvider } from "./src/auth/AuthProvider";

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
