import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

const schema = {
  type:'object', additionalProperties:false,
  properties:{items:{type:'array',items:{type:'object',additionalProperties:false,properties:{
    type:{type:'string',enum:['flight','train','bus','hotel','ticket']}, title:{type:'string'}, date:{type:'string'}, start:{type:'string'}, end:{type:'string'}, duration:{type:'number'}, address:{type:'string'}, operator:{type:'string'}, reservationCode:{type:'string'}, seat:{type:'string'}, platform:{type:'string'}, note:{type:'string'}
  },required:['type','title','date','start','end','duration','address','operator','reservationCode','seat','platform','note']}}},required:['items']
};

export async function POST(req:Request){
 try{
  if(!process.env.OPENAI_API_KEY) return NextResponse.json({error:'OPENAI_API_KEY가 설정되지 않았어요.'},{status:503});
  const form=await req.formData(); const image=form.get('image');
  if(!(image instanceof File)) return NextResponse.json({error:'이미지가 필요해요.'},{status:400});
  if(image.size>12*1024*1024) return NextResponse.json({error:'이미지는 12MB 이하로 올려주세요.'},{status:400});
  const mime=image.type||'image/jpeg'; const base64=Buffer.from(await image.arrayBuffer()).toString('base64');
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const response=await client.responses.create({model:process.env.OPENAI_VISION_MODEL||'gpt-4.1-mini',input:[{role:'user',content:[{type:'input_text',text:`이 이미지는 여행 예약 또는 티켓 화면이다. 이미지에 실제로 보이는 정보만 추출하라. 항공편, 기차, 버스는 출발 일정 하나로 만들고 제목에 노선/편명/열차명을 포함한다. 호텔은 체크인과 체크아웃이 둘 다 보이면 각각 일정으로 만든다. 입장권은 입장 시각 일정으로 만든다. 날짜는 YYYY-MM-DD, 시각은 HH:mm 24시간제로 작성한다. 종료 시각이 없으면 합리적인 기본 duration을 쓰되 note에 추정이라고 표시한다. 읽을 수 없는 값은 빈 문자열로 둔다. 예약번호는 reservationCode에만 넣는다.`},{type:'input_image',image_url:`data:${mime};base64,${base64}`,detail:'high'}]}],text:{format:{type:'json_schema',name:'travel_ticket',strict:true,schema}}});
  const parsed=JSON.parse(response.output_text||'{"items":[]}');
  return NextResponse.json(parsed);
 }catch(e:any){console.error(e);return NextResponse.json({error:e?.message||'이미지 분석에 실패했어요.'},{status:500});}
}
