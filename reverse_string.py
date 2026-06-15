def reverse_string(s: str) -> str:
    """Return the reversed version of the input string."""
    return s[::-1]

if __name__ == "__main__":
    # Simple demo
    example = "Hello, World!"
    print(f"Original: {example}")
    print(f"Reversed: {reverse_string(example)}")
