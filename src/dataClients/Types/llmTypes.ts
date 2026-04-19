
export type LlmInput = 
{
    messages: {
        role:"user"|"bot",
        content:string
    }[],
    collectedParams: Record<string,string | number | null>
}

export type LlmOutput = 
{
    response:string,
    collectedParams: Record<string,string | number | null>
}