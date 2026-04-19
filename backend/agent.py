import os
import logging
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger("agent")

# Configure the Gemini API key
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    logger.info(f"Gemini API key found (ends with ...{api_key[-6:]})")
    genai.configure(api_key=api_key)
else:
    logger.error("GEMINI_API_KEY not found in environment!")

class AIAgent:
    def __init__(self):
        # We can use gemini-1.5-flash for faster responses and lower cost/free tier
        try:
            self.model = genai.GenerativeModel('gemini-flash-latest')
            logger.info("Gemini model 'gemini-flash-latest' initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing Gemini model: {e}")
            self.model = None

    def _generate(self, prompt: str) -> str:
        if not self.model:
            logger.error("_generate called but model is None!")
            return "Error: Gemini API is not configured or initialized properly. Check your GEMINI_API_KEY."
        try:
            logger.debug(f"Sending prompt to Gemini ({len(prompt)} chars)...")
            response = self.model.generate_content(prompt)
            logger.info(f"Gemini response received ({len(response.text)} chars)")
            logger.debug(f"Response preview: {response.text[:150]}...")
            return response.text
        except Exception as e:
            logger.error(f"Gemini generation error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return f"Error generating response: {e}"

    def ask_question(self, query: str, context: str) -> str:
        logger.info(f"ask_question: query='{query[:60]}', context_len={len(context)}")
        prompt = f"""
        You are a helpful AI study assistant. Use the following context to answer the user's question.
        If the answer is not in the context, say "I cannot find the answer in the provided document."

        Context:
        {context}

        Question: {query}
        """
        return self._generate(prompt)

    def generate_quiz(self, context: str, num_questions: int = 5) -> str:
        logger.info(f"generate_quiz: num_questions={num_questions}, context_len={len(context)}")
        prompt = f"""
        Based on the provided text, strictly generate exactly {num_questions} Multiple Choice Questions (MCQs).
        You must return the result as ONLY a raw JSON array, with no other text, no markdown formatting, and no ```json blocks.
        
        The JSON format must be strictly an array of objects where each object has:
        - "question": a string with the question text
        - "options": an array of 4 strings representing the possible answers
        - "answer_index": an integer (0, 1, 2, or 3) indicating which option is correct

        Context:
        {context}
        """
        return self._generate(prompt)

    def explain_simply(self, context: str) -> str:
        logger.info(f"explain_simply: context_len={len(context)}")
        prompt = f"""
        Explain the following text in very simple terms, as if you are explaining it to a 10-year-old.
        Use analogies if helpful, and keep it easy to understand.

        Context:
        {context}
        """
        return self._generate(prompt)

    def handle_agent_task(self, task: str, context: str) -> str:
        """
        General agent task executor. It breaks down the task into steps internally
        and provides the final result based on the context.
        """
        logger.info(f"handle_agent_task: task='{task[:60]}', context_len={len(context)}")
        prompt = f"""
        You are a highly capable AI assistant helping a student.
        You have been given a specific task to perform based on the provided context document.
        
        Task: {task}
        
        To execute this well:
        1. Understand what the user is asking.
        2. Look at the context provided.
        3. Break down the task if needed and output the final structured result in a clear, formatted way.

        Context:
        {context}
        """
        return self._generate(prompt)

    def generate_podcast_script(self, context: str) -> str:
        logger.info(f"generate_podcast_script: context_len={len(context)}")
        prompt = f"""
        Based on the provided context, generate a conversational study podcast script.
        The podcast features two speakers:
        1. Alex (The Host): Curious, asks engaging questions, and summarizes points.
        2. Dr. Sarah (The Expert): Clear, knowledgeable, and uses simple analogies.

        The script should be exactly 8-10 lines of dialogue.
        You must return the result as ONLY a raw JSON array of objects, with no other text and no markdown blocks.

        Each JSON object must have:
        - "speaker": Either "Host" or "Expert"
        - "text": The dialogue line

        Example format:
        [
          {{"speaker": "Host", "text": "Welcome back! Today we are diving into..."}},
          {{"speaker": "Expert", "text": "Thanks Alex. One key thing to understand is..."}}
        ]

        Context:
        {context}
        """
        return self._generate(prompt)
