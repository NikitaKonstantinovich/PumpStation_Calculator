"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Mode="login"|"register"|"forgot"|"verify"|"reset";

export function AccountScreen({initialMode="login"}:{initialMode?:Mode}){
  const [mode,setMode]=useState<Mode>(initialMode),[busy,setBusy]=useState(initialMode==="verify"),[message,setMessage]=useState(""),[error,setError]=useState("");
  const params=typeof window==="undefined"?null:new URLSearchParams(window.location.search),token=params?.get("token")??"";
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setBusy(true);setError("");setMessage("");
    const data=Object.fromEntries(new FormData(event.currentTarget));
    const action=mode==="register"?"register":mode==="forgot"?"forgot":mode==="reset"?"reset":"login";
    try{
      const response=await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...data,action,token})}),result=await response.json() as {error?:string;developmentLink?:string};
      if(!response.ok)throw new Error(result.error??"Не удалось выполнить операцию.");
      if(action==="login"||action==="reset")window.location.replace("/");
      else if(action==="register")setMessage(`Письмо отправлено. Откройте ссылку подтверждения.${result.developmentLink?` Для локальной проверки: ${result.developmentLink}`:""}`);
      else setMessage(`Если аккаунт существует, письмо со ссылкой уже отправлено.${result.developmentLink?` Для локальной проверки: ${result.developmentLink}`:""}`);
    }catch(reason){setError(reason instanceof Error?reason.message:"Произошла ошибка.");}finally{setBusy(false);}
  };
  useEffect(()=>{
    if(mode!=="verify"||!token)return;
    fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"verify",token})}).then(async response=>{const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error);setMessage("Почта подтверждена. Открываем рабочее пространство…");window.setTimeout(()=>window.location.replace("/"),700);}).catch(reason=>setError(reason instanceof Error?reason.message:"Не удалось подтвердить почту.")).finally(()=>setBusy(false));
  },[mode,token]);
  const switchMode=(next:Mode)=>{setMode(next);setMessage("");setError("");};
  return <main className="auth-page"><section className="auth-intro"><Link className="brand auth-brand" href="/"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></Link><div><span className="auth-intro__eyebrow">ИНЖЕНЕРНАЯ СРЕДА</span><h1>Ваши расчёты и проекты всегда под рукой</h1><p>Создавайте насосные станции, сохраняйте варианты и продолжайте работу с любого устройства.</p></div><ul><li><i>✓</i> Персональная база проектов</li><li><i>✓</i> Автоматическое сохранение расчётов</li><li><i>✓</i> Защищённый доступ по почте</li></ul></section><section className="auth-panel"><div className="auth-card">
    {mode==="verify"?<><span className="auth-icon">✉</span><h2>Подтверждение почты</h2><p>{busy?"Проверяем ссылку…":"Подтверждаем вашу учётную запись."}</p></>:
    <><div className="auth-card__heading"><span className="auth-icon">{mode==="reset"||mode==="forgot"?"↻":"→"}</span><h2>{mode==="register"?"Создать аккаунт":mode==="forgot"?"Восстановить пароль":mode==="reset"?"Новый пароль":"Вход в аккаунт"}</h2><p>{mode==="register"?"После регистрации подтвердите адрес по ссылке из письма.":mode==="forgot"?"Отправим одноразовую ссылку на вашу почту.":mode==="reset"?"Придумайте новый надёжный пароль.":"Продолжите работу над своими проектами."}</p></div><form className="auth-form" onSubmit={submit}>
      {mode==="register"&&<label><span>Имя</span><input name="name" autoComplete="name" minLength={2} required placeholder="Алексей Белов"/></label>}
      {mode!=="reset"&&<label><span>Электронная почта</span><input name="email" type="email" autoComplete="email" required placeholder="name@company.ru"/></label>}
      {(mode==="login"||mode==="register"||mode==="reset")&&<label><span>{mode==="reset"?"Новый пароль":"Пароль"}</span><input name="password" type="password" autoComplete={mode==="login"?"current-password":"new-password"} minLength={10} required placeholder="Не менее 10 символов"/></label>}
      {mode==="register"&&<label><span>Повторите пароль</span><input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={10} required onInput={event=>{const input=event.currentTarget,password=input.form?.elements.namedItem("password") as HTMLInputElement|null;input.setCustomValidity(input.value!==password?.value?"Пароли не совпадают":"");}} placeholder="Повторите пароль"/></label>}
      {mode==="login"&&<button type="button" className="auth-link auth-link--right" onClick={()=>switchMode("forgot")}>Забыли пароль?</button>}
      <button className="auth-submit" disabled={busy}>{busy?"Подождите…":mode==="register"?"Зарегистрироваться":mode==="forgot"?"Отправить ссылку":mode==="reset"?"Сохранить новый пароль":"Войти"}</button>
    </form></>}
    {error&&<div className="auth-notice auth-notice--error">{error}</div>}{message&&<div className="auth-notice">{message}</div>}
    {mode!=="verify"&&<div className="auth-switch">{mode==="login"?<><span>Нет аккаунта?</span><button onClick={()=>switchMode("register")}>Зарегистрироваться</button></>:<><span>{mode==="register"?"Уже есть аккаунт?":"Вспомнили пароль?"}</span><button onClick={()=>switchMode("login")}>Войти</button></>}</div>}
  </div></section></main>;
}
