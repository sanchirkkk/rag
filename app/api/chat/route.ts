import OpenAI from 'openai';
import {OpenAIStream, StreamingTextResponse} from 'ai';
import {AstraDB} from "@datastax/astra-db-ts";
import { NextResponse } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const astraDb = new AstraDB(process.env.ASTRA_DB_APPLICATION_TOKEN, process.env.ASTRA_DB_API_ENDPOINT, process.env.ASTRA_DB_NAMESPACE);

export async function POST(req: Request) {
  try {
    const {messages, useRag, llm, similarityMetric} = await req.json();

    const latestMessage = messages[messages?.length - 1]?.content;

    let docContext = '';
    if (useRag) {
      const {data} = await openai.embeddings.create({input: latestMessage, model: 'text-embedding-3-large'});

      const collection = await astraDb.collection("kb1");

      const cursor= collection.find(null, {
        sort: {
          $vector: data[0]?.embedding,
          
        }
      });
      
      const documents = await cursor.toArray();
      
      docContext = `
        START CONTEXT
        ${documents?.map(doc => doc.content).join("\n")}
        END CONTEXT
      `
    }
    const ragPrompt = [
      {
        role: 'system',
        content: `You are an AI assistant answering questions about Cassandra and Astra DB. Format responses using markdown where applicable.
        ${docContext} 
        If the answer is not provided in the context, the AI assistant will say, "I'm sorry, I don't know the answer".
      `,
      },
    ]

    const mes = [...ragPrompt, ...messages]

    const payload = {
      model: "gpt-4-1106-preview",
      messages: mes,
      max_tokens: 256,
      temperature: 0.8,
      top_p: 1,
    };
  
    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer sk-test-dTkZZRqwDy1uqe4D00NWT3BlbkFJ9xtDsNF7B8J8SnJHmn7m" },
      
      method: "POST",
      body: JSON.stringify(payload),
     }).then((response) => response.json());
  
    console.log(completion);
    const chatGptResponse = completion.choices[0].message.content;
    const regex = /[?!]/g;
    const latest = chatGptResponse.replace(regex, ' ');
    return NextResponse.json(latest)


  } catch (e) {
    throw e;
  }
}
