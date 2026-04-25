import { Stack } from "expo-router";

export default function NFCLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false, // ✅ hides the "index" header
        }}
      />
    </Stack>
  );
}
