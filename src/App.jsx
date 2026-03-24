import { useState, useEffect, useCallback } from "react"
import { supabase, auth, listings as listingsApi, bids as bidsApi, reviews as reviewsApi, resale as resaleApi, profiles as profilesApi } from "./supabaseClient"
import { createCheckoutSession } from "./stripe"

// ============================================================
// THEME
// ============================================================
const t = {
  bg: "#F9F7F5", card: "#FFFFFF", elevated: "#F2EFE9",
  border: "#E8E0D5", borderFocus: "#C9933A",
  gold: "#C9933A", goldLight: "#E8B84C", goldDim: "#8A6020",
  text: "#1E1812", muted: "#7A6F60", dim: "#B0A898",
  green: "#2E7D32", greenBg: "#E8F5E9", greenBorder: "#A5D6A7",
  red: "#C62828", redBg: "#FFEBEE", redBorder: "#EF9A9A",
  blue: "#1565C0", blueBg: "#E3F2FD", blueBorder: "#90CAF9",
  shadow: "0 2px 12px rgba(0,0,0,0.07)",
  shadowLg: "0 8px 32px rgba(0,0,0,0.12)",
}

// ============================================================
// HELPERS
// ============================================================
const itemIcons = { watch:"⌚",jewelry:"💎",ring:"💍",necklace:"📿",bracelet:"🔗",earrings:"✨",brooch:"🪻",other:"🔧" }
const urgencyColor = { low:"secondary", medium:"gold", high:"red" }
const statusColor = { open:"green", in_progress:"blue", completed:"secondary", cancelled:"red" }
const conditionColor = { excellent:"green", very_good:"blue", good:"gold", fair:"secondary" }
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) } catch { return "—" } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ============================================================
// PRIMITIVES
// ============================================================
function Stars({ value, onChange, readonly=false }) {
  return (
    <div style={{display:"flex",gap:3}}>
      {[1,2,3,4,5].map(s => (
        <button key={s} type="button" disabled={readonly} onClick={()=>onChange&&onChange(s)}
          style={{background:"none",border:"none",cursor:readonly?"default":"pointer",padding:0,fontSize:18,color:s<=value?t.gold:t.border,transition:"transform 0.15s"}}
          onMouseEnter={e=>{if(!readonly)e.currentTarget.style.transform="scale(1.2)"}}
          onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)"}}>★</button>
      ))}
    </div>
  )
}

function Badge({ children, color="secondary", style:ex={} }) {
  const c = {
    secondary:{bg:t.elevated,border:t.border,text:t.muted},
    gold:{bg:"#FFF8E1",border:"#FFD54F",text:t.goldDim},
    green:{bg:t.greenBg,border:t.greenBorder,text:t.green},
    red:{bg:t.redBg,border:t.redBorder,text:t.red},
    blue:{bg:t.blueBg,border:t.blueBorder,text:t.blue},
  }[color]||{bg:t.elevated,border:t.border,text:t.muted}
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:600,letterSpacing:"0.04em",background:c.bg,border:`1px solid ${c.border}`,color:c.text,whiteSpace:"nowrap",...ex}}>{children}</span>
}

function Btn({ children, onClick, type="button", variant="primary", disabled=false, style:ex={}, size="md", loading=false }) {
  const [hov,setHov] = useState(false)
  const sz = {sm:{padding:"5px 14px",fontSize:12},md:{padding:"9px 20px",fontSize:13},lg:{padding:"12px 28px",fontSize:14}}[size]||{padding:"9px 20px",fontSize:13}
  const v = {
    primary:{background:hov?"#A87020":t.gold,color:"#fff",border:"none",boxShadow:hov?t.shadowLg:t.shadow},
    outline:{background:hov?t.elevated:"transparent",color:t.muted,border:`1px solid ${t.border}`},
    ghost:{background:hov?t.elevated:"transparent",color:t.muted,border:"none"},
    danger:{background:hov?"#FFCDD2":t.redBg,color:t.red,border:`1px solid ${t.redBorder}`},
    success:{background:hov?"#C8E6C9":t.greenBg,color:t.green,border:`1px solid ${t.greenBorder}`},
  }[variant]||{}
  return (
    <button type={type} onClick={onClick} disabled={disabled||loading}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{...sz,...v,borderRadius:10,cursor:(disabled||loading)?"not-allowed":"pointer",fontWeight:600,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,opacity:(disabled||loading)?0.6:1,transition:"all 0.18s",...ex}}>
      {loading ? <span style={{display:"inline-block",width:14,height:14,border:"2px solid currentColor",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite"}} /> : children}
    </button>
  )
}

function Field({ label, children }) {
  return <div style={{display:"flex",flexDirection:"column",gap:5}}>{label&&<label style={{fontSize:12,color:t.muted,fontWeight:500}}>{label}</label>}{children}</div>
}

const inputStyle = {background:t.card,border:`1px solid ${t.border}`,borderRadius:10,padding:"9px 13px",color:t.text,fontSize:14,width:"100%",transition:"all 0.18s"}

function Input({ label, ...props }) {
  return <Field label={label}><input {...props} style={{...inputStyle,...(props.style||{})}} /></Field>
}

function Textarea({ label, rows=3, ...props }) {
  return <Field label={label}><textarea rows={rows} {...props} style={{...inputStyle,resize:"vertical",...(props.style||{})}} /></Field>
}

function Select({ label, value, onChange, options }) {
  return (
    <Field label={label}>
      <select value={value} onChange={e=>onChange(e.target.value)} style={{...inputStyle,cursor:"pointer"}}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  )
}

function Card({ children, style:ex={}, hover=false, onClick }) {
  const [hov,setHov]=useState(false)
  return (
    <div onClick={onClick} onMouseEnter={()=>hover&&setHov(true)} onMouseLeave={()=>hover&&setHov(false)}
      style={{background:t.card,border:`1px solid ${hov?t.borderFocus:t.border}`,borderRadius:16,padding:20,transition:"all 0.22s",boxShadow:hov?t.shadowLg:t.shadow,transform:hover&&hov?"translateY(-3px)":"none",cursor:hover?"pointer":"default",...ex}}>
      {children}
    </div>
  )
}

function Modal({ open, onClose, title, children }) {
  useEffect(()=>{ if(open) document.body.style.overflow="hidden"; else document.body.style.overflow=""; return()=>{document.body.style.overflow=""} },[open])
  if(!open) return null
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(4px)"}}>
      <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:18,width:"100%",maxWidth:560,maxHeight:"90vh",overflow:"auto",padding:28,boxShadow:"0 20px 60px rgba(0,0,0,0.18)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <span style={{fontFamily:"'Playfair Display',serif",fontSize:21,color:t.text,fontWeight:700}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:t.muted,fontSize:24,cursor:"pointer",lineHeight:1,padding:"0 4px"}}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Tabs({ value, onChange, options }) {
  return (
    <div style={{display:"flex",gap:2,background:t.elevated,padding:4,borderRadius:12,border:`1px solid ${t.border}`,width:"fit-content"}}>
      {options.map(o=>(
        <button key={o.value} onClick={()=>onChange(o.value)}
          style={{padding:"6px 16px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:500,transition:"all 0.18s",background:value===o.value?t.card:"transparent",color:value===o.value?t.text:t.muted,boxShadow:value===o.value?t.shadow:"none"}}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Alert({ type="info", children }) {
  const colors = {
    info:{bg:t.blueBg,border:t.blueBorder,text:t.blue},
    success:{bg:t.greenBg,border:t.greenBorder,text:t.green},
    error:{bg:t.redBg,border:t.redBorder,text:t.red},
  }[type]
  return <div style={{padding:"12px 16px",background:colors.bg,border:`1px solid ${colors.border}`,borderRadius:10,fontSize:13,color:colors.text,fontWeight:500}}>{children}</div>
}

// ============================================================
// IMAGE UPLOADER — uses Supabase Storage
// ============================================================
function ImageUploader({ images=[], onChange, listingId="temp" }) {
  const [uploading,setUploading]=useState(false)
  const handleFiles = async (e) => {
    const files = Array.from(e.target.files)
    if(!files.length) return
    setUploading(true)
    try {
      const urls = []
      for(const file of files) {
        const ext = file.name.split('.').pop()
        const path = `${listingId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage.from('listing-images').upload(path, file)
        if(error) throw error
        const { data } = supabase.storage.from('listing-images').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
      onChange([...images,...urls])
    } catch(err) {
      // Fall back to local preview if storage not set up yet
      const urls = files.map(f=>URL.createObjectURL(f))
      onChange([...images,...urls])
    } finally {
      setUploading(false)
    }
  }
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
      {images.map((url,i)=>(
        <div key={i} style={{position:"relative",aspectRatio:"1",borderRadius:10,overflow:"hidden",border:`1px solid ${t.border}`}}>
          <img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} />
          <button onClick={()=>onChange(images.filter((_,idx)=>idx!==i))} style={{position:"absolute",top:4,right:4,width:20,height:20,borderRadius:"50%",background:t.red,border:"none",color:"#fff",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
      ))}
      <label style={{aspectRatio:"1",borderRadius:10,border:`2px dashed ${t.border}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:uploading?"wait":"pointer",gap:4,transition:"border-color 0.18s",background:uploading?t.elevated:"transparent"}}
        onMouseEnter={e=>e.currentTarget.style.borderColor=t.gold}
        onMouseLeave={e=>e.currentTarget.style.borderColor=t.border}>
        {uploading ? <span style={{fontSize:14,animation:"spin 0.7s linear infinite",display:"inline-block"}}>⏳</span> : <>
          <span style={{fontSize:20}}>📷</span>
          <span style={{fontSize:10,color:t.muted,fontWeight:500}}>Add Photo</span>
        </>}
        <input type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFiles} disabled={uploading} />
      </label>
    </div>
  )
}

// ============================================================
// AUTH MODAL
// ============================================================
function AuthModal({ open, onClose, onAuth }) {
  const [mode,setMode]=useState("signin")
  const [email,setEmail]=useState("")
  const [password,setPassword]=useState("")
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState("")
  const [success,setSuccess]=useState("")

  const handle = async (e) => {
    e.preventDefault()
    setLoading(true); setError(""); setSuccess("")
    try {
      if(mode==="signin") {
        const { data, error } = await auth.signIn(email, password)
        if(error) throw error
        onAuth(data.user)
        onClose()
      } else {
        const { data, error } = await auth.signUp(email, password)
        if(error) throw error
        if(data.user && !data.session) {
          setSuccess("Check your email to confirm your account, then sign in.")
        } else {
          onAuth(data.user)
          onClose()
        }
      }
    } catch(err) {
      setError(err.message || "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={mode==="signin" ? "Sign In" : "Create Account"}>
      <form onSubmit={handle} style={{display:"flex",flexDirection:"column",gap:14}}>
        {error && <Alert type="error">{error}</Alert>}
        {success && <Alert type="success">{success}</Alert>}
        <Input label="Email" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required />
        <Input label="Password" type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} required />
        <Btn type="submit" loading={loading} style={{width:"100%",marginTop:4}}>
          {mode==="signin" ? "Sign In" : "Create Account"}
        </Btn>
        <p style={{textAlign:"center",fontSize:13,color:t.muted}}>
          {mode==="signin" ? "Don't have an account? " : "Already have an account? "}
          <button type="button" onClick={()=>{setMode(mode==="signin"?"signup":"signin");setError("");setSuccess("")}}
            style={{background:"none",border:"none",color:t.gold,cursor:"pointer",fontWeight:600,fontSize:13}}>
            {mode==="signin" ? "Sign Up" : "Sign In"}
          </button>
        </p>
      </form>
    </Modal>
  )
}

// ============================================================
// LISTING CARD
// ============================================================
function ListingCard({ listing, bidCount, onClick }) {
  return (
    <Card hover onClick={()=>onClick&&onClick(listing)} style={{padding:0,overflow:"hidden"}}>
      <div style={{aspectRatio:"4/3",background:t.elevated,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",fontSize:52,color:t.dim,overflow:"hidden"}}>
        {listing.images?.length>0
          ? <img src={listing.images[0]} alt={listing.title} style={{width:"100%",height:"100%",objectFit:"cover"}} />
          : itemIcons[listing.item_type]||"🔧"}
        <div style={{position:"absolute",top:10,left:10}}><Badge>{itemIcons[listing.item_type]} {listing.item_type}</Badge></div>
        {listing.urgency&&<div style={{position:"absolute",top:10,right:10}}><Badge color={urgencyColor[listing.urgency]}>{listing.urgency} urgency</Badge></div>}
      </div>
      <div style={{padding:"16px 18px"}}>
        <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:15,color:t.text,fontWeight:600,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{listing.title}</h3>
        {listing.brand&&<p style={{fontSize:11,color:t.muted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6,fontWeight:500}}>{listing.brand}</p>}
        <p style={{fontSize:13,color:t.muted,lineHeight:1.6,marginBottom:14,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{listing.description}</p>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:12,borderTop:`1px solid ${t.border}`}}>
          <span style={{fontSize:11,color:t.dim}}>🕐 {fmtDate(listing.created_at)}</span>
          {listing.location&&<span style={{fontSize:11,color:t.dim}}>📍 {listing.location}</span>}
          <span style={{fontSize:12,color:t.gold,fontWeight:600}}>💬 {bidCount||0} bids</span>
        </div>
      </div>
    </Card>
  )
}

// ============================================================
// BID CARD
// ============================================================
function BidCard({ bid, isLowest, isTopRated, repairmanRating, reviewCount, onAccept, isOwner, listingStatus, listing, user }) {
  const [paying,setPaying]=useState(false)

  const handlePay = async () => {
    setPaying(true)
    try { await createCheckoutSession({ bid, listing, customerEmail: user?.email||"" }) }
    finally { setPaying(false) }
  }

  return (
    <div style={{background:bid.status==="accepted"?"#F1F8F1":t.card,border:`1px solid ${bid.status==="accepted"?t.greenBorder:isLowest?"#A5D6A7":isTopRated?"#FFD54F":t.border}`,borderLeft:`4px solid ${bid.status==="accepted"?t.green:isLowest?t.green:isTopRated?t.gold:t.border}`,borderRadius:14,padding:"16px 18px",marginBottom:10,boxShadow:t.shadow}}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {isLowest&&<Badge color="green">↓ Lowest Bid</Badge>}
        {isTopRated&&<Badge color="gold">★ Top Rated</Badge>}
        {bid.status==="accepted"&&<Badge color="green">✓ Accepted</Badge>}
        {bid.status==="rejected"&&<Badge color="red">Rejected</Badge>}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
        <div style={{width:40,height:40,borderRadius:"50%",background:"#FFF8E1",border:"2px solid #FFD54F",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:t.goldDim,fontWeight:700,flexShrink:0}}>
          {(bid.repairman_name||bid.repairman_email||"?")[0].toUpperCase()}
        </div>
        <div>
          <p style={{fontSize:14,color:t.text,fontWeight:600}}>{bid.repairman_name||bid.repairman_email}</p>
          <div style={{fontSize:12,color:t.muted,marginTop:1}}>
            {repairmanRating>0 ? <><span style={{color:t.gold}}>★ {repairmanRating.toFixed(1)}</span> <span>({reviewCount} reviews)</span></> : <span>No reviews yet</span>}
          </div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
        <div style={{background:t.elevated,borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:10,color:t.muted,fontWeight:500,marginBottom:3}}>💵 Repair</div>
          <div style={{fontSize:18,fontFamily:"'Playfair Display',serif",color:isLowest?t.green:t.text,fontWeight:700}}>${bid.repair_price}</div>
        </div>
        {bid.purchase_price>0&&<div style={{background:"#FFF8E1",border:"1px solid #FFD54F",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:10,color:t.goldDim,fontWeight:500,marginBottom:3}}>🛒 Buy Offer</div>
          <div style={{fontSize:18,fontFamily:"'Playfair Display',serif",color:t.gold,fontWeight:700}}>${bid.purchase_price}</div>
        </div>}
        {bid.estimated_days>0&&<div style={{background:t.elevated,borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:10,color:t.muted,fontWeight:500,marginBottom:3}}>🕐 Est. Days</div>
          <div style={{fontSize:18,fontFamily:"'Playfair Display',serif",color:t.text,fontWeight:700}}>{bid.estimated_days}d</div>
        </div>}
      </div>
      {bid.message&&<p style={{fontSize:13,color:t.muted,fontStyle:"italic",marginBottom:12,lineHeight:1.6,padding:"8px 12px",background:t.elevated,borderRadius:8}}>"{bid.message}"</p>}
      {isOwner&&listingStatus==="open"&&bid.status==="pending"&&(
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={()=>onAccept(bid)} style={{flex:1}}>Accept This Bid</Btn>
        </div>
      )}
      {isOwner&&bid.status==="accepted"&&listingStatus==="in_progress"&&(
        <Btn variant="success" loading={paying} onClick={handlePay} style={{width:"100%"}}>💳 Pay via Stripe</Btn>
      )}
    </div>
  )
}

// ============================================================
// BID FORM
// ============================================================
function BidForm({ listingId, user, onBidPlaced }) {
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState("")
  const [form,setForm]=useState({repair_price:"",purchase_price:"",estimated_days:"",message:""})

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError("")
    try {
      await bidsApi.create({
        listing_id: listingId,
        repairman_email: user.email,
        repairman_name: user.user_metadata?.full_name || user.email,
        repair_price: parseFloat(form.repair_price),
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : 0,
        estimated_days: form.estimated_days ? parseInt(form.estimated_days) : 0,
        message: form.message,
        status: "pending",
      })
      setForm({repair_price:"",purchase_price:"",estimated_days:"",message:""})
      onBidPlaced()
    } catch(err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{background:t.elevated,border:`1px solid ${t.border}`,borderRadius:14,padding:18}}>
      <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:t.text,marginBottom:14,fontWeight:600}}>Place Your Bid</h3>
      {error&&<div style={{marginBottom:12}}><Alert type="error">{error}</Alert></div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <Input label="Repair Price ($) *" type="number" min="0" step="0.01" placeholder="150.00" value={form.repair_price} onChange={e=>setForm({...form,repair_price:e.target.value})} required />
        <Input label="Purchase Offer ($)" type="number" min="0" step="0.01" placeholder="Optional" value={form.purchase_price} onChange={e=>setForm({...form,purchase_price:e.target.value})} />
      </div>
      <div style={{marginBottom:10}}>
        <Input label="Estimated Days" type="number" min="1" placeholder="e.g. 5" value={form.estimated_days} onChange={e=>setForm({...form,estimated_days:e.target.value})} />
      </div>
      <div style={{marginBottom:14}}>
        <Textarea label="Message to Customer" placeholder="Describe your experience with this type of repair..." value={form.message} onChange={e=>setForm({...form,message:e.target.value})} />
      </div>
      <Btn type="submit" disabled={!form.repair_price} loading={saving} style={{width:"100%"}}>Submit Bid</Btn>
    </form>
  )
}

// ============================================================
// REVIEW FORM
// ============================================================
function ReviewForm({ listingId, repairmanEmail, reviewerEmail, onReviewSubmitted }) {
  const [saving,setSaving]=useState(false)
  const [form,setForm]=useState({quality_rating:0,experience_rating:0,comment:""})

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await reviewsApi.create({ listing_id:listingId, repairman_email:repairmanEmail, reviewer_email:reviewerEmail, quality_rating:form.quality_rating, experience_rating:form.experience_rating, comment:form.comment })
      onReviewSubmitted()
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{background:t.elevated,border:`1px solid ${t.border}`,borderRadius:14,padding:18}}>
      <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:t.text,marginBottom:14,fontWeight:600}}>Rate This Repairman</h3>
      <div style={{marginBottom:12}}>
        <label style={{fontSize:12,color:t.muted,fontWeight:500,display:"block",marginBottom:6}}>Work Quality</label>
        <Stars value={form.quality_rating} onChange={v=>setForm({...form,quality_rating:v})} />
      </div>
      <div style={{marginBottom:12}}>
        <label style={{fontSize:12,color:t.muted,fontWeight:500,display:"block",marginBottom:6}}>Overall Experience</label>
        <Stars value={form.experience_rating} onChange={v=>setForm({...form,experience_rating:v})} />
      </div>
      <div style={{marginBottom:14}}>
        <Textarea label="Comment" placeholder="Share your experience..." value={form.comment} onChange={e=>setForm({...form,comment:e.target.value})} />
      </div>
      <Btn type="submit" disabled={form.quality_rating===0||form.experience_rating===0} loading={saving} style={{width:"100%"}}>Submit Review</Btn>
    </form>
  )
}

// ============================================================
// PAGE: HOME
// ============================================================
function Home({ setPage, setSelectedListing, user, showAuth }) {
  const [allListings,setAllListings]=useState([])
  const [allBids,setAllBids]=useState([])
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState("")
  const [typeFilter,setTypeFilter]=useState("all")

  useEffect(()=>{
    Promise.all([listingsApi.getAll(), bidsApi.getAll()])
      .then(([ls,bs])=>{ setAllListings(ls); setAllBids(bs) })
      .finally(()=>setLoading(false))
  },[])

  const bidCounts = allBids.reduce((acc,b)=>{ acc[b.listing_id]=(acc[b.listing_id]||0)+1; return acc },{})
  const filtered = allListings.filter(l=>{
    if(l.status!=="open") return false
    if(typeFilter!=="all"&&l.item_type!==typeFilter) return false
    if(search){ const q=search.toLowerCase(); return l.title?.toLowerCase().includes(q)||l.description?.toLowerCase().includes(q)||l.brand?.toLowerCase().includes(q) }
    return true
  })

  return (
    <div>
      {/* Hero */}
      <section style={{background:"linear-gradient(135deg,#FFFDF8 0%,#FDF6E8 100%)",borderBottom:`1px solid ${t.border}`,padding:"64px 32px 52px"}}>
        <div style={{maxWidth:960,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
            <div style={{height:2,width:36,background:t.gold,borderRadius:2}} />
            <span style={{fontSize:12,color:t.gold,letterSpacing:"0.18em",textTransform:"uppercase",fontWeight:600}}>Trusted Marketplace</span>
          </div>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:54,fontWeight:700,color:t.text,lineHeight:1.1,marginBottom:18}}>
            Expert Repair for Your<br /><span style={{color:t.gold}}>Precious</span> Pieces
          </h1>
          <p style={{fontSize:17,color:t.muted,lineHeight:1.75,maxWidth:500,marginBottom:30}}>
            Connect with verified watchmakers and jewelers. Post your repair needs, receive competitive bids, and choose the perfect craftsman.
          </p>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            <Btn onClick={()=>user?setPage("post-repair"):showAuth()} size="lg">+ Post a Repair</Btn>
            <Btn variant="outline" onClick={()=>document.getElementById("browse")?.scrollIntoView({behavior:"smooth"})} size="lg">Browse Listings →</Btn>
          </div>
          <div style={{display:"flex",gap:36,marginTop:48,flexWrap:"wrap"}}>
            {[{icon:"⌚",label:"Active Listings",value:allListings.filter(l=>l.status==="open").length},{icon:"💬",label:"Total Bids",value:allBids.length},{icon:"✅",label:"Completed Repairs",value:allListings.filter(l=>l.status==="completed").length}].map(s=>(
              <div key={s.label} style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:44,height:44,borderRadius:12,background:"#FFF8E1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:t.shadow}}>{s.icon}</div>
                <div>
                  <div style={{fontSize:26,fontFamily:"'Playfair Display',serif",fontWeight:700,color:t.text}}>{s.value}</div>
                  <div style={{fontSize:12,color:t.muted,fontWeight:500}}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Browse */}
      <section id="browse" style={{maxWidth:960,margin:"0 auto",padding:"40px 32px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,marginBottom:24,flexWrap:"wrap"}}>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:t.text,fontWeight:700}}>Open Repair Jobs</h2>
          <div style={{display:"flex",gap:10}}>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",fontSize:13}}>🔍</span>
              <input placeholder="Search listings..." value={search} onChange={e=>setSearch(e.target.value)}
                style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:10,padding:"9px 12px 9px 32px",color:t.text,fontSize:13,width:210,boxShadow:t.shadow}} />
            </div>
            <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
              style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:10,padding:"9px 13px",color:t.text,fontSize:13,cursor:"pointer",boxShadow:t.shadow}}>
              <option value="all">All Types</option>
              {["watch","jewelry","ring","necklace","bracelet","earrings","brooch","other"].map(tv=><option key={tv} value={tv}>{tv.charAt(0).toUpperCase()+tv.slice(1)}</option>)}
            </select>
          </div>
        </div>
        {loading ? (
          <div style={{textAlign:"center",padding:"60px 0",color:t.muted,fontSize:14}}>Loading listings...</div>
        ) : filtered.length===0 ? (
          <div style={{textAlign:"center",padding:"60px 0"}}>
            <div style={{fontSize:52,marginBottom:12}}>🔍</div>
            <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:t.text,marginBottom:8}}>No listings found</h3>
            <p style={{color:t.muted,marginBottom:22}}>Be the first to post a repair job!</p>
            <Btn onClick={()=>user?setPage("post-repair"):showAuth()}>+ Post a Repair</Btn>
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:22}}>
            {filtered.map(listing=><ListingCard key={listing.id} listing={listing} bidCount={bidCounts[listing.id]} onClick={l=>{setSelectedListing(l);setPage("listing-detail")}} />)}
          </div>
        )}
      </section>
    </div>
  )
}

// ============================================================
// PAGE: LISTING DETAIL
// ============================================================
function ListingDetail({ listing, user, setPage, showAuth }) {
  const [current,setCurrent]=useState(listing)
  const [bids,setBids]=useState([])
  const [allReviews,setAllReviews]=useState([])
  const [loading,setLoading]=useState(true)
  const [reviewed,setReviewed]=useState(false)

  useEffect(()=>{
    if(!listing) return
    Promise.all([bidsApi.getByListing(listing.id), reviewsApi.getAll()])
      .then(([bs,rs])=>{ setBids(bs); setAllReviews(rs) })
      .finally(()=>setLoading(false))
  },[listing?.id])

  const getStats = (email) => { const rs=allReviews.filter(r=>r.repairman_email===email); if(!rs.length) return {avg:0,count:0}; return {avg:rs.reduce((s,r)=>s+(r.quality_rating+r.experience_rating)/2,0)/rs.length,count:rs.length} }
  const lowestId = bids.length ? bids.reduce((m,b)=>b.repair_price<m.repair_price?b:m,bids[0]).id : null
  const topRatedId = (()=>{ if(!bids.length) return null; let best=null,br=-1; for(const b of bids){ const s=getStats(b.repairman_email); if(s.avg>br){br=s.avg;best=b.id} } return br>0?best:null })()
  const isOwner = user&&current.created_by===user.email
  const isRepairman = user?.user_metadata?.role==="repairman"
  const hasUserBid = bids.some(b=>b.repairman_email===user?.email)
  const existingReview = allReviews.find(r=>r.listing_id===listing?.id&&r.reviewer_email===user?.email)

  const handleAccept = async (bid) => {
    await Promise.all([
      bidsApi.update(bid.id,{status:"accepted"}),
      listingsApi.update(current.id,{status:"in_progress",accepted_repairman_email:bid.repairman_email}),
      ...bids.filter(b=>b.id!==bid.id&&b.status==="pending").map(b=>bidsApi.update(b.id,{status:"rejected"}))
    ])
    setBids(prev=>prev.map(b=>b.id===bid.id?{...b,status:"accepted"}:b.status==="pending"?{...b,status:"rejected"}:b))
    setCurrent(prev=>({...prev,status:"in_progress",accepted_repairman_email:bid.repairman_email}))
  }

  const handleComplete = async () => {
    await listingsApi.update(current.id,{status:"completed"})
    setCurrent(prev=>({...prev,status:"completed"}))
  }

  if(!listing) return <div style={{padding:60,textAlign:"center",color:t.muted}}>No listing selected.</div>

  return (
    <div style={{maxWidth:960,margin:"0 auto",padding:"32px 32px"}}>
      <button onClick={()=>setPage("home")} style={{background:"none",border:"none",color:t.muted,fontSize:13,cursor:"pointer",marginBottom:22,display:"flex",alignItems:"center",gap:6,fontWeight:500}}>← Back to listings</button>
      <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:28,alignItems:"start"}}>
        {/* Left */}
        <div>
          <div style={{aspectRatio:"4/3",background:t.elevated,borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:80,color:t.dim,marginBottom:20,overflow:"hidden",boxShadow:t.shadow}}>
            {current.images?.length>0 ? <img src={current.images[0]} alt={current.title} style={{width:"100%",height:"100%",objectFit:"cover"}} /> : itemIcons[current.item_type]||"🔧"}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
            <Badge color={statusColor[current.status]}>{current.status?.replace("_"," ")}</Badge>
            <Badge>{itemIcons[current.item_type]} {current.item_type}</Badge>
            {current.urgency&&<Badge color={urgencyColor[current.urgency]}>{current.urgency} urgency</Badge>}
          </div>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:30,color:t.text,fontWeight:700,marginBottom:6}}>{current.title}</h1>
          {current.brand&&<p style={{fontSize:12,color:t.muted,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,fontWeight:600}}>{current.brand}</p>}
          <p style={{color:t.muted,lineHeight:1.75,fontSize:15,marginBottom:18}}>{current.description}</p>
          <div style={{display:"flex",gap:22,fontSize:13,color:t.dim}}>
            <span>🕐 {fmtDate(current.created_at)}</span>
            {current.location&&<span>📍 {current.location}</span>}
            <span>💬 {bids.length} bids</span>
          </div>
          {isOwner&&current.status==="in_progress"&&<div style={{marginTop:20}}><Btn variant="success" onClick={handleComplete}>✓ Mark as Completed</Btn></div>}
          {isOwner&&current.status==="completed"&&current.accepted_repairman_email&&!existingReview&&!reviewed&&(
            <div style={{marginTop:20}}>
              <ReviewForm listingId={listing.id} repairmanEmail={current.accepted_repairman_email} reviewerEmail={user.email} onReviewSubmitted={()=>setReviewed(true)} />
            </div>
          )}
          {(existingReview||reviewed)&&<div style={{marginTop:20}}><Alert type="success">✓ Review submitted. Thank you!</Alert></div>}
        </div>

        {/* Right: Bids */}
        <div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:t.text,fontWeight:700,marginBottom:16}}>Bids {bids.length>0&&`(${bids.length})`}</h2>
          {isRepairman&&current.status==="open"&&!hasUserBid&&<div style={{marginBottom:16}}><BidForm listingId={listing.id} user={user} onBidPlaced={()=>bidsApi.getByListing(listing.id).then(setBids)} /></div>}
          {isRepairman&&hasUserBid&&<div style={{marginBottom:14}}><Alert type="info">You've already placed a bid on this listing.</Alert></div>}
          {!user&&<div style={{padding:20,background:t.elevated,border:`1px solid ${t.border}`,borderRadius:14,textAlign:"center",marginBottom:14}}><p style={{fontSize:13,color:t.muted,marginBottom:12}}>Sign in to place a bid</p><Btn variant="outline" onClick={showAuth}>Sign In</Btn></div>}
          {loading ? <div style={{textAlign:"center",padding:30,color:t.muted}}>Loading bids...</div>
          : bids.length===0 ? <div style={{padding:"40px 20px",background:t.elevated,border:`1px solid ${t.border}`,borderRadius:14,textAlign:"center"}}><p style={{color:t.muted,fontSize:13}}>No bids yet.</p></div>
          : bids.map(bid=>{ const s=getStats(bid.repairman_email); return <BidCard key={bid.id} bid={bid} isLowest={bid.id===lowestId} isTopRated={bid.id===topRatedId} repairmanRating={s.avg} reviewCount={s.count} onAccept={handleAccept} isOwner={isOwner} listingStatus={current.status} listing={current} user={user} /> })}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// PAGE: MY BIDS
// ============================================================
function MyBids({ user, setPage, setSelectedListing }) {
  const [myBids,setMyBids]=useState([])
  const [allListings,setAllListings]=useState([])
  const [loading,setLoading]=useState(true)
  const [statusFilter,setStatusFilter]=useState("all")

  useEffect(()=>{
    if(!user) return
    Promise.all([bidsApi.getByRepairman(user.email), listingsApi.getAll()])
      .then(([bs,ls])=>{ setMyBids(bs); setAllListings(ls) })
      .finally(()=>setLoading(false))
  },[user?.email])

  const listingsMap = allListings.reduce((acc,l)=>{ acc[l.id]=l; return acc },{})
  const filtered = statusFilter==="all" ? myBids : myBids.filter(b=>b.status===statusFilter)
  const sc = {pending:"gold",accepted:"green",rejected:"red",withdrawn:"secondary"}

  return (
    <div style={{maxWidth:800,margin:"0 auto",padding:"40px 32px"}}>
      <div style={{marginBottom:26}}>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:30,color:t.text,fontWeight:700}}>My Bids</h1>
        <p style={{fontSize:13,color:t.muted,marginTop:4}}>Track the bids you've placed on repair jobs</p>
      </div>
      <div style={{marginBottom:22}}>
        <Tabs value={statusFilter} onChange={setStatusFilter} options={[{value:"all",label:`All (${myBids.length})`},{value:"pending",label:"Pending"},{value:"accepted",label:"Accepted"},{value:"rejected",label:"Rejected"}]} />
      </div>
      {loading ? <div style={{textAlign:"center",padding:"60px 0",color:t.muted}}>Loading...</div>
      : filtered.length===0 ? (
        <div style={{textAlign:"center",padding:"60px 0"}}>
          <div style={{fontSize:52,marginBottom:12}}>🔨</div>
          <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:t.text,marginBottom:8}}>No bids yet</h3>
          <p style={{color:t.muted,marginBottom:22}}>Browse listings and place your first bid.</p>
          <Btn onClick={()=>setPage("home")}>Browse Listings</Btn>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {filtered.map(bid=>{ const listing=listingsMap[bid.listing_id]; return (
            <Card key={bid.id} hover onClick={()=>{ setSelectedListing(listing); setPage("listing-detail") }}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                    <Badge color={sc[bid.status]}>{bid.status}</Badge>
                    <span style={{fontSize:11,color:t.dim}}>{fmtDate(bid.created_at)}</span>
                  </div>
                  <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:15,color:t.text,fontWeight:600,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{listing?.title||"Listing"}</h3>
                  {listing?.brand&&<p style={{fontSize:11,color:t.muted,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:500}}>{listing.brand}</p>}
                  {bid.message&&<p style={{fontSize:12,color:t.muted,marginTop:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{bid.message}</p>}
                </div>
                <div style={{display:"flex",gap:18,alignItems:"center",flexShrink:0}}>
                  <div style={{textAlign:"right"}}><div style={{fontSize:10,color:t.muted,fontWeight:500}}>💵 Repair</div><div style={{fontSize:18,fontFamily:"'Playfair Display',serif",color:t.text,fontWeight:700}}>${bid.repair_price}</div></div>
                  {bid.purchase_price>0&&<div style={{textAlign:"right"}}><div style={{fontSize:10,color:t.goldDim,fontWeight:500}}>🛒 Buy</div><div style={{fontSize:18,fontFamily:"'Playfair Display',serif",color:t.gold,fontWeight:700}}>${bid.purchase_price}</div></div>}
                  <span style={{color:t.dim,fontSize:16}}>→</span>
                </div>
              </div>
            </Card>
          )})}
        </div>
      )}
    </div>
  )
}

// ============================================================
// PAGE: MY LISTINGS
// ============================================================
function MyListings({ user, setPage, setSelectedListing, showAuth }) {
  const [myListings,setMyListings]=useState([])
  const [allBids,setAllBids]=useState([])
  const [loading,setLoading]=useState(true)
  const [statusFilter,setStatusFilter]=useState("all")

  useEffect(()=>{
    if(!user) return
    Promise.all([listingsApi.getByUser(user.email), bidsApi.getAll()])
      .then(([ls,bs])=>{ setMyListings(ls); setAllBids(bs) })
      .finally(()=>setLoading(false))
  },[user?.email])

  const bidCounts = allBids.reduce((acc,b)=>{ acc[b.listing_id]=(acc[b.listing_id]||0)+1; return acc },{})
  const filtered = statusFilter==="all" ? myListings : myListings.filter(l=>l.status===statusFilter)

  return (
    <div style={{maxWidth:960,margin:"0 auto",padding:"40px 32px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:26,flexWrap:"wrap",gap:12}}>
        <div><h1 style={{fontFamily:"'Playfair Display',serif",fontSize:30,color:t.text,fontWeight:700}}>My Listings</h1><p style={{fontSize:13,color:t.muted,marginTop:4}}>Manage your posted repair jobs</p></div>
        <Btn onClick={()=>user?setPage("post-repair"):showAuth()}>+ Post New</Btn>
      </div>
      <div style={{marginBottom:22}}>
        <Tabs value={statusFilter} onChange={setStatusFilter} options={[{value:"all",label:`All (${myListings.length})`},{value:"open",label:"Open"},{value:"in_progress",label:"In Progress"},{value:"completed",label:"Completed"}]} />
      </div>
      {!user ? <Alert type="info">Please sign in to view your listings.</Alert>
      : loading ? <div style={{textAlign:"center",padding:"60px 0",color:t.muted}}>Loading...</div>
      : filtered.length===0 ? (
        <div style={{textAlign:"center",padding:"60px 0"}}>
          <div style={{fontSize:52,marginBottom:12}}>📋</div>
          <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:t.text,marginBottom:8}}>No listings yet</h3>
          <Btn onClick={()=>setPage("post-repair")}>+ Post a Repair</Btn>
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:22}}>
          {filtered.map(listing=><ListingCard key={listing.id} listing={listing} bidCount={bidCounts[listing.id]} onClick={l=>{setSelectedListing(l);setPage("listing-detail")}} />)}
        </div>
      )}
    </div>
  )
}

// ============================================================
// PAGE: POST REPAIR
// ============================================================
function PostRepair({ user, setPage, showAuth }) {
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState("")
  const [form,setForm]=useState({title:"",description:"",item_type:"watch",brand:"",images:[],urgency:"medium",location:""})

  useEffect(()=>{ if(!user) showAuth() },[])

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError("")
    try {
      await listingsApi.create({ ...form, status:"open", created_by:user.email })
      setPage("my-listings")
    } catch(err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const itemTypeOpts = ["watch","jewelry","ring","necklace","bracelet","earrings","brooch","other"].map(v=>({value:v,label:v.charAt(0).toUpperCase()+v.slice(1)}))

  return (
    <div style={{maxWidth:580,margin:"0 auto",padding:"40px 32px"}}>
      <button onClick={()=>setPage("home")} style={{background:"none",border:"none",color:t.muted,fontSize:13,cursor:"pointer",marginBottom:22,display:"flex",alignItems:"center",gap:6,fontWeight:500}}>← Back to listings</button>
      <Card>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:28,color:t.text,fontWeight:700,marginBottom:6}}>Post a Repair Job</h1>
        <p style={{fontSize:13,color:t.muted,marginBottom:26}}>Describe your item and the issue — repairmen will bid on the job.</p>
        {error&&<div style={{marginBottom:16}}><Alert type="error">{error}</Alert></div>}
        <form onSubmit={handleSubmit} style={{display:"flex",flexDirection:"column",gap:16}}>
          <Input label="Title *" placeholder="e.g. Rolex Submariner — Crystal Replacement" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required />
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Select label="Item Type" value={form.item_type} onChange={v=>setForm({...form,item_type:v})} options={itemTypeOpts} />
            <Input label="Brand" placeholder="e.g. Rolex, Cartier" value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})} />
          </div>
          <Textarea label="Description *" placeholder="Describe the issue in detail..." value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={4} required />
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Select label="Urgency" value={form.urgency} onChange={v=>setForm({...form,urgency:v})} options={[{value:"low",label:"Low — No rush"},{value:"medium",label:"Medium"},{value:"high",label:"High — ASAP"}]} />
            <Input label="Location" placeholder="City, State" value={form.location} onChange={e=>setForm({...form,location:e.target.value})} />
          </div>
          <div>
            <label style={{fontSize:12,color:t.muted,fontWeight:500,display:"block",marginBottom:8}}>Photos</label>
            <ImageUploader images={form.images} onChange={imgs=>setForm({...form,images:imgs})} />
          </div>
          <Btn type="submit" disabled={!form.title||!form.description} loading={saving} size="lg" style={{width:"100%",marginTop:4}}>Post Repair Job</Btn>
        </form>
      </Card>
    </div>
  )
}

// ============================================================
// PAGE: PROFILE
// ============================================================
function Profile({ user, setUser, showAuth }) {
  const [saving,setSaving]=useState(false)
  const [saved,setSaved]=useState(false)
  const [reviews,setReviews]=useState([])
  const [form,setForm]=useState({role:"customer",bio:"",specialties:[],years_experience:"",location:""})

  useEffect(()=>{
    if(!user) return
    profilesApi.get(user.email).then(p=>{ if(p) setForm({role:p.role||"customer",bio:p.bio||"",specialties:p.specialties||[],years_experience:p.years_experience||"",location:p.location||""}) })
    reviewsApi.getByRepairman(user.email).then(setReviews)
  },[user?.email])

  const avgRating = reviews.length ? reviews.reduce((s,r)=>s+(r.quality_rating+r.experience_rating)/2,0)/reviews.length : 0
  const specs = ["Watch Movement","Watch Crystal","Watch Band","Watch Dial","Ring Sizing","Prong Repair","Stone Setting","Chain Repair","Clasp Repair","Polishing","Engraving","Custom Design","Antique Restoration","Pearl Restringing"]
  const toggleSpec = s => setForm(p=>({...p,specialties:p.specialties.includes(s)?p.specialties.filter(x=>x!==s):[...p.specialties,s]}))

  const handleSave = async () => {
    setSaving(true)
    try { await profilesApi.upsert({email:user.email,...form}); setSaved(true); setTimeout(()=>setSaved(false),2500) }
    finally { setSaving(false) }
  }

  if(!user) return <div style={{maxWidth:580,margin:"0 auto",padding:"60px 32px",textAlign:"center"}}><p style={{color:t.muted,marginBottom:20}}>Sign in to view your profile.</p><Btn onClick={showAuth}>Sign In</Btn></div>

  return (
    <div style={{maxWidth:580,margin:"0 auto",padding:"40px 32px"}}>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:30,color:t.text,fontWeight:700,marginBottom:26}}>Profile</h1>
      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        <Card>
          <h2 style={{fontSize:16,color:t.text,fontWeight:600,marginBottom:16}}>Account Info</h2>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div><p style={{fontSize:11,color:t.muted,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>Email</p><p style={{fontSize:15,color:t.text,fontWeight:500}}>{user.email}</p></div>
          </div>
          <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${t.border}`}}>
            <Btn variant="ghost" onClick={()=>auth.signOut().then(()=>setUser(null))} style={{color:t.red,fontSize:13}}>Sign Out</Btn>
          </div>
        </Card>
        <Card>
          <h2 style={{fontSize:16,color:t.text,fontWeight:600,marginBottom:18}}>Settings</h2>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Select label="I am a" value={form.role} onChange={v=>setForm({...form,role:v})} options={[{value:"customer",label:"Customer — I need repairs"},{value:"repairman",label:"Repairman — I do repairs"}]} />
            <Input label="Location" placeholder="City, State" value={form.location} onChange={e=>setForm({...form,location:e.target.value})} />
            <Textarea label="Bio" placeholder="Tell us about yourself..." value={form.bio} onChange={e=>setForm({...form,bio:e.target.value})} />
            {form.role==="repairman"&&<>
              <Input label="Years of Experience" type="number" min="0" placeholder="e.g. 10" value={form.years_experience} onChange={e=>setForm({...form,years_experience:e.target.value})} />
              <div>
                <label style={{fontSize:12,color:t.muted,fontWeight:500,display:"block",marginBottom:8}}>Specialties</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                  {specs.map(s=><button key={s} type="button" onClick={()=>toggleSpec(s)} style={{padding:"5px 13px",borderRadius:20,fontSize:12,cursor:"pointer",transition:"all 0.15s",fontWeight:500,background:form.specialties.includes(s)?"#FFF8E1":t.elevated,border:`1px solid ${form.specialties.includes(s)?"#FFD54F":t.border}`,color:form.specialties.includes(s)?t.goldDim:t.muted}}>{s}</button>)}
                </div>
              </div>
            </>}
            <Btn onClick={handleSave} loading={saving} style={{width:"100%"}}>{saved?"✓ Saved!":"💾 Save Profile"}</Btn>
          </div>
        </Card>
        {form.role==="repairman"&&reviews.length>0&&(
          <Card>
            <h2 style={{fontSize:16,color:t.text,fontWeight:600,marginBottom:16}}>🏆 Your Ratings</h2>
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18}}>
              <div style={{textAlign:"center"}}>
                <p style={{fontSize:38,fontFamily:"'Playfair Display',serif",color:t.gold,fontWeight:700}}>{avgRating.toFixed(1)}</p>
                <Stars value={Math.round(avgRating)} readonly />
                <p style={{fontSize:12,color:t.muted,marginTop:4}}>{reviews.length} reviews</p>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {reviews.slice(0,5).map(r=>(
                <div key={r.id} style={{padding:"12px 14px",background:t.elevated,borderRadius:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:5}}>
                    <Stars value={Math.round((r.quality_rating+r.experience_rating)/2)} readonly />
                    <span style={{fontSize:11,color:t.muted}}>Quality: {r.quality_rating} · Experience: {r.experience_rating}</span>
                  </div>
                  {r.comment&&<p style={{fontSize:13,color:t.muted}}>{r.comment}</p>}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// ============================================================
// PAGE: RESALE
// ============================================================
function Resale({ user, showAuth }) {
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState("")
  const [typeFilter,setTypeFilter]=useState("all")
  const [statusFilter,setStatusFilter]=useState("available")
  const [showPost,setShowPost]=useState(false)
  const [selectedItem,setSelectedItem]=useState(null)

  useEffect(()=>{ resaleApi.getAll().then(setItems).finally(()=>setLoading(false)) },[])

  const filtered = items.filter(item=>{
    if(statusFilter!=="all"&&item.status!==statusFilter) return false
    if(typeFilter!=="all"&&item.item_type!==typeFilter) return false
    if(search){ const q=search.toLowerCase(); return item.title?.toLowerCase().includes(q)||item.brand?.toLowerCase().includes(q) }
    return true
  })

  const itemTypeOpts = ["watch","jewelry","ring","necklace","bracelet","earrings","brooch","other"].map(v=>({value:v,label:v.charAt(0).toUpperCase()+v.slice(1)}))

  return (
    <div>
      <section style={{background:"linear-gradient(135deg,#FFFDF8 0%,#FDF6E8 100%)",borderBottom:`1px solid ${t.border}`,padding:"52px 32px 42px"}}>
        <div style={{maxWidth:960,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}><div style={{height:2,width:36,background:t.gold,borderRadius:2}} /><span style={{fontSize:12,color:t.gold,letterSpacing:"0.18em",textTransform:"uppercase",fontWeight:600}}>Resale Market</span></div>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:46,fontWeight:700,color:t.text,marginBottom:14}}>Buy & Sell <span style={{color:t.gold}}>Restored</span> Pieces</h1>
          <p style={{fontSize:15,color:t.muted,maxWidth:500,lineHeight:1.75,marginBottom:26}}>A curated marketplace for professionally repaired watches and jewelry.</p>
          <Btn onClick={()=>user?setShowPost(true):showAuth()} size="lg">+ List an Item</Btn>
        </div>
      </section>
      <section style={{maxWidth:960,margin:"0 auto",padding:"32px 32px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22,flexWrap:"wrap"}}>
          <Tabs value={statusFilter} onChange={setStatusFilter} options={[{value:"available",label:"Available"},{value:"sold",label:"Sold"},{value:"all",label:"All"}]} />
          <div style={{display:"flex",gap:10,marginLeft:"auto"}}>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:12}}>🔍</span>
              <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:10,padding:"8px 12px 8px 28px",color:t.text,fontSize:13,width:170}} />
            </div>
            <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:10,padding:"8px 13px",color:t.text,fontSize:13,cursor:"pointer"}}>
              <option value="all">All Types</option>
              {["watch","jewelry","ring","necklace","bracelet","earrings","other"].map(tv=><option key={tv} value={tv}>{tv.charAt(0).toUpperCase()+tv.slice(1)}</option>)}
            </select>
          </div>
        </div>
        {loading ? <div style={{textAlign:"center",padding:"60px 0",color:t.muted}}>Loading...</div>
        : filtered.length===0 ? (
          <div style={{textAlign:"center",padding:"60px 0"}}>
            <div style={{fontSize:52,marginBottom:12}}>🛍️</div>
            <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:t.text,marginBottom:8}}>No items listed yet</h3>
            <Btn onClick={()=>user?setShowPost(true):showAuth()}>+ List an Item</Btn>
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:22}}>
            {filtered.map(item=>(
              <Card key={item.id} hover onClick={()=>setSelectedItem(item)} style={{padding:0,overflow:"hidden"}}>
                <div style={{aspectRatio:"4/3",background:t.elevated,display:"flex",alignItems:"center",justifyContent:"center",fontSize:52,color:t.dim,position:"relative",overflow:"hidden"}}>
                  {item.images?.length>0 ? <img src={item.images[0]} alt={item.title} style={{width:"100%",height:"100%",objectFit:"cover"}} /> : itemIcons[item.item_type]||"🔧"}
                  <div style={{position:"absolute",top:10,left:10}}><Badge>{itemIcons[item.item_type]} {item.item_type}</Badge></div>
                  {item.was_repaired&&<div style={{position:"absolute",top:10,right:10}}><Badge color="green">🔧 Restored</Badge></div>}
                  {item.status==="sold"&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center"}}><Badge color="red" style={{fontSize:15,padding:"5px 16px"}}>SOLD</Badge></div>}
                </div>
                <div style={{padding:"14px 16px"}}>
                  <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:15,color:t.text,fontWeight:600,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</h3>
                  {item.brand&&<p style={{fontSize:11,color:t.muted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6,fontWeight:500}}>{item.brand}</p>}
                  <p style={{fontSize:12,color:t.muted,lineHeight:1.5,marginBottom:12,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{item.description}</p>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:10,borderTop:`1px solid ${t.border}`}}>
                    <span style={{fontSize:20,fontFamily:"'Playfair Display',serif",color:t.text,fontWeight:700}}>${item.price?.toLocaleString()}</span>
                    <Badge color={conditionColor[item.condition]}>{item.condition?.replace("_"," ")}</Badge>
                  </div>
                  {item.location&&<p style={{fontSize:11,color:t.dim,marginTop:6}}>📍 {item.location}</p>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Post Resale Modal */}
      {showPost&&(()=>{
        const [form,setForm]=useState({title:"",description:"",item_type:"watch",brand:"",price:"",condition:"good",images:[],was_repaired:true,repair_notes:"",location:""})
        const [saving,setSaving]=useState(false)
        const handlePost = async (e) => {
          e.preventDefault(); setSaving(true)
          try {
            const item = await resaleApi.create({...form,price:parseFloat(form.price),status:"available",created_by:user.email})
            setItems(prev=>[item,...prev]); setShowPost(false)
          } finally { setSaving(false) }
        }
        return (
          <Modal open title="List an Item for Sale" onClose={()=>setShowPost(false)}>
            <form onSubmit={handlePost} style={{display:"flex",flexDirection:"column",gap:13}}>
              <Input label="Title *" placeholder="e.g. Restored Omega Seamaster" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required />
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <Select label="Item Type" value={form.item_type} onChange={v=>setForm({...form,item_type:v})} options={itemTypeOpts} />
                <Input label="Brand" placeholder="e.g. Omega" value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})} />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <Input label="Asking Price ($) *" type="number" min="0" placeholder="1200" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} required />
                <Select label="Condition" value={form.condition} onChange={v=>setForm({...form,condition:v})} options={[{value:"excellent",label:"Excellent"},{value:"very_good",label:"Very Good"},{value:"good",label:"Good"},{value:"fair",label:"Fair"}]} />
              </div>
              <Textarea label="Description *" placeholder="Describe the item..." value={form.description} onChange={e=>setForm({...form,description:e.target.value})} required />
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 13px",background:t.elevated,borderRadius:10}}>
                <input type="checkbox" id="wr" checked={form.was_repaired} onChange={e=>setForm({...form,was_repaired:e.target.checked})} style={{accentColor:t.gold,width:16,height:16}} />
                <label htmlFor="wr" style={{fontSize:13,color:t.muted,cursor:"pointer",fontWeight:500}}>Professionally repaired/restored</label>
              </div>
              {form.was_repaired&&<Input label="Repair Notes" placeholder="e.g. Full movement service" value={form.repair_notes} onChange={e=>setForm({...form,repair_notes:e.target.value})} />}
              <Input label="Location" placeholder="City, State" value={form.location} onChange={e=>setForm({...form,location:e.target.value})} />
              <div><label style={{fontSize:12,color:t.muted,fontWeight:500,display:"block",marginBottom:8}}>Photos</label><ImageUploader images={form.images} onChange={imgs=>setForm({...form,images:imgs})} /></div>
              <Btn type="submit" disabled={!form.title||!form.price} loading={saving} style={{width:"100%"}}>Post Listing</Btn>
            </form>
          </Modal>
        )
      })()}

      {/* Item Detail Modal */}
      {selectedItem&&(
        <Modal open title={selectedItem.title} onClose={()=>setSelectedItem(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {selectedItem.images?.length>0&&<div style={{aspectRatio:"4/3",borderRadius:12,overflow:"hidden",background:t.elevated}}><img src={selectedItem.images[0]} alt={selectedItem.title} style={{width:"100%",height:"100%",objectFit:"cover"}} /></div>}
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Badge>{itemIcons[selectedItem.item_type]} {selectedItem.item_type}</Badge>
              <Badge color={conditionColor[selectedItem.condition]}>{selectedItem.condition?.replace("_"," ")}</Badge>
              {selectedItem.was_repaired&&<Badge color="green">🔧 Restored</Badge>}
              {selectedItem.status==="sold"&&<Badge color="red">Sold</Badge>}
            </div>
            {selectedItem.brand&&<p style={{fontSize:11,color:t.muted,letterSpacing:"0.15em",textTransform:"uppercase",fontWeight:600}}>{selectedItem.brand}</p>}
            <p style={{fontFamily:"'Playfair Display',serif",fontSize:30,color:t.text,fontWeight:700}}>${selectedItem.price?.toLocaleString()}</p>
            <p style={{fontSize:14,color:t.muted,lineHeight:1.75}}>{selectedItem.description}</p>
            {selectedItem.repair_notes&&<div style={{padding:"12px 14px",background:t.greenBg,border:`1px solid ${t.greenBorder}`,borderRadius:10}}><p style={{fontSize:11,color:t.green,marginBottom:4,fontWeight:600}}>🔧 Repair Notes</p><p style={{fontSize:13,color:t.text}}>{selectedItem.repair_notes}</p></div>}
            {selectedItem.location&&<p style={{fontSize:13,color:t.muted}}>📍 {selectedItem.location}</p>}
            <p style={{fontSize:12,color:t.muted}}>Seller: <span style={{fontWeight:600,color:t.text}}>{selectedItem.created_by}</span></p>
            {user?.email===selectedItem.created_by&&selectedItem.status==="available"
              ? <Btn variant="danger" onClick={async()=>{ await resaleApi.update(selectedItem.id,{status:"sold"}); setItems(prev=>prev.map(i=>i.id===selectedItem.id?{...i,status:"sold"}:i)); setSelectedItem(null) }} style={{width:"100%"}}>Mark as Sold</Btn>
              : selectedItem.status==="available"
                ? <Btn onClick={()=>{window.location.href=`mailto:${selectedItem.created_by}?subject=Interested in: ${selectedItem.title}`}} style={{width:"100%"}}>Contact Seller</Btn>
                : null}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ============================================================
// LAYOUT / NAV
// ============================================================
function Layout({ page, setPage, user, showAuth, children }) {
  const nav = [
    {id:"home",label:"Browse",icon:"🏠"},
    {id:"post-repair",label:"Post Repair",icon:"+"},
    {id:"my-listings",label:"My Listings",icon:"📋"},
    {id:"resale",label:"Resale",icon:"🛍️"},
    {id:"my-bids",label:"My Bids",icon:"🔨"},
    {id:"profile",label:"Profile",icon:"👤"},
  ]
  return (
    <div style={{minHeight:"100vh",background:t.bg}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <header style={{position:"sticky",top:0,zIndex:100,background:"rgba(255,255,255,0.88)",backdropFilter:"blur(16px)",borderBottom:`1px solid ${t.border}`,boxShadow:"0 1px 8px rgba(0,0,0,0.06)"}}>
        <div style={{maxWidth:960,margin:"0 auto",padding:"0 32px",display:"flex",alignItems:"center",justifyContent:"space-between",height:64}}>
          <button onClick={()=>setPage("home")} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:"#FFF8E1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,boxShadow:t.shadow}}>⌚</div>
            <span style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:t.text,fontWeight:700,letterSpacing:"-0.02em"}}>Caliber & Co.</span>
          </button>
          <nav style={{display:"flex",alignItems:"center",gap:2}}>
            {nav.map(item=>(
              <button key={item.id} onClick={()=>setPage(item.id)}
                style={{padding:"7px 14px",background:page===item.id?"#FFF8E1":"none",border:page===item.id?"1px solid #FFD54F":"1px solid transparent",borderRadius:10,cursor:"pointer",color:page===item.id?t.goldDim:t.muted,fontSize:13,fontWeight:page===item.id?600:500,transition:"all 0.18s"}}>
                {item.label}
              </button>
            ))}
          </nav>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {user
              ? <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:34,height:34,borderRadius:"50%",background:"#FFF8E1",border:"2px solid #FFD54F",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:t.goldDim,fontWeight:700}}>{(user.email||"?")[0].toUpperCase()}</div><span style={{fontSize:13,color:t.muted,fontWeight:500,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.email}</span></div>
              : <Btn variant="outline" onClick={showAuth} size="sm">Sign In</Btn>}
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}

// ============================================================
// ROOT APP
// ============================================================
export default function App() {
  const [page,setPage]=useState("home")
  const [selectedListing,setSelectedListing]=useState(null)
  const [user,setUser]=useState(null)
  const [showAuthModal,setShowAuthModal]=useState(false)
  const [authLoading,setAuthLoading]=useState(true)

  useEffect(()=>{
    auth.getUser().then(({data:{user}})=>{ setUser(user); setAuthLoading(false) })
    const { data:{ subscription } } = auth.onAuthChange((_,session)=>{ setUser(session?.user||null) })
    return ()=>subscription.unsubscribe()
  },[])

  const showAuth = useCallback(()=>setShowAuthModal(true),[])

  const renderPage = () => {
    if(authLoading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"60vh",color:t.muted,fontSize:14}}>Loading...</div>
    switch(page) {
      case "home": return <Home setPage={setPage} setSelectedListing={setSelectedListing} user={user} showAuth={showAuth} />
      case "listing-detail": return <ListingDetail listing={selectedListing} user={user} setPage={setPage} showAuth={showAuth} />
      case "my-bids": return <MyBids user={user} setPage={setPage} setSelectedListing={setSelectedListing} />
      case "my-listings": return <MyListings user={user} setPage={setPage} setSelectedListing={setSelectedListing} showAuth={showAuth} />
      case "post-repair": return <PostRepair user={user} setPage={setPage} showAuth={showAuth} />
      case "profile": return <Profile user={user} setUser={setUser} showAuth={showAuth} />
      case "resale": return <Resale user={user} showAuth={showAuth} />
      default: return <Home setPage={setPage} setSelectedListing={setSelectedListing} user={user} showAuth={showAuth} />
    }
  }

  return (
    <>
      <Layout page={page} setPage={setPage} user={user} showAuth={showAuth}>
        {renderPage()}
      </Layout>
      <AuthModal open={showAuthModal} onClose={()=>setShowAuthModal(false)} onAuth={u=>{ setUser(u); setShowAuthModal(false) }} />
    </>
  )
}
 
