---
name: swift
description: Swift development — writing, reviewing, and rating Swift code for iOS/macOS. Trigger keywords: swift, iOS, macOS, xcode, swiftui, uikit, swift code review.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Swift — iOS/macOS Development

Guidelines for writing, reviewing, and rating Swift code.

## Code Style

### Naming

- **Types**: `UpperCamelCase` — `struct MessageView`, `class NetworkManager`
- **Functions/properties**: `lowerCamelCase` — `func fetchMessages()`, `var isLoading`
- **Constants**: `lowerCamelCase` — `let maxRetries = 3`
- **Protocols**: Describe capability — `Codable`, `Sendable`, `MessageHandling`

### Structure

- One type per file (matching filename)
- Use extensions to organize protocol conformances
- Prefer `struct` over `class` unless reference semantics are needed
- Prefer `let` over `var` unless mutation is required

### Modern Swift Patterns

- Use `async/await` over completion handlers
- Use `Actor` for thread-safe mutable state
- Use `@Observable` (iOS 17+) or `ObservableObject` for state management
- Use structured concurrency (`TaskGroup`, `async let`) over `DispatchQueue`
- Use `Codable` for serialization
- Use `Result` type for error handling in non-async contexts

## SwiftUI Conventions

```swift
struct ContentView: View {
    @State private var items: [Item] = []

    var body: some View {
        List(items) { item in
            ItemRow(item: item)
        }
        .task {
            items = await fetchItems()
        }
    }
}
```

- Extract subviews when `body` exceeds ~30 lines
- Use `@State` for local view state, `@Binding` for parent-owned state
- Use `.task {}` for async work on view appear
- Prefer `NavigationStack` over deprecated `NavigationView`

## Code Review Checklist

When reviewing or rating Swift code, check:

1. **Safety**: No force unwraps (`!`) unless guaranteed — prefer `guard let` / `if let`
2. **Memory**: No retain cycles — use `[weak self]` in closures that capture `self`
3. **Concurrency**: Proper `@Sendable` conformance, no data races
4. **Error handling**: `do/catch` with specific error types, not bare `try?`
5. **API design**: Clear parameter labels, consistent naming
6. **Performance**: Avoid unnecessary allocations in hot paths
7. **Accessibility**: VoiceOver labels, Dynamic Type support
8. **Testing**: Protocols for dependency injection, testable architecture

## Rating Scale

When asked to rate Swift code:

| Rating | Meaning |
|--------|---------|
| A | Production-ready, follows all conventions, well-tested |
| B | Good with minor issues — missing docs, small style inconsistencies |
| C | Functional but has code smells — force unwraps, retain cycles, unclear naming |
| D | Significant issues — race conditions, memory leaks, no error handling |
| F | Broken or dangerous — crashes, security vulnerabilities, undefined behavior |
