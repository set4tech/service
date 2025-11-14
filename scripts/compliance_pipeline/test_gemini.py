import os
from litellm import completion

# Test Gemini API directly
messages = [{
    "role": "user",
    "content": "Respond with valid JSON: {\"status\": \"ok\", \"message\": \"test\"}"
}]

print("Testing Gemini API...")
print(f"API Key set: {bool(os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY'))}")

try:
    response = completion(
        model='gemini/gemini-2.0-flash-exp',
        messages=messages,
        temperature=0.1
    )
    
    print(f"\nResponse type: {type(response)}")
    print(f"Response: {response}")
    print(f"\nContent: {response.choices[0].message.content}")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
