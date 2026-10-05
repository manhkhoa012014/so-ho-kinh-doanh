import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id), pad=n=>String(n).padStart(2,"0"), now=new Date();
const today=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
const money=n=>new Intl.NumberFormat("vi-VN",{style:"currency",currency:"VND",maximumFractionDigits:0}).format(Number(n)||0);
const num=n=>new Intl.NumberFormat("vi-VN",{maximumFractionDigits:0}).format(Number(n)||0);
const fmtDate=d=>{if(!d)return"";let[y,m,day]=d.split("-");return`${day}/${m}/${y}`};
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random();
const RATES={goods:{name:"Phân phối, cung cấp hàng hóa",gtgt:.01,tncn:.005},service:{name:"Dịch vụ, xây dựng không bao thầu nguyên vật liệu",gtgt:.05,tncn:.02},production:{name:"Sản xuất, vận tải, xây dựng có bao thầu nguyên vật liệu",gtgt:.03,tncn:.015},other:{name:"Hoạt động kinh doanh khác",gtgt:.02,tncn:.01}};
let state={settings:{name:"Hộ kinh doanh",tax:"",address:"",location:"",year:now.getFullYear(),rep:"",group:"",method:"",businessType:"goods"},transactions:[],costs:[],inventory:[],cash:[],taxDeadlines:[]};
let auth=null,db=null,currentUser=null,registerMode=false,activeLedger="revenue";
function msg(t,error=false){$("authMessage").textContent=t;$("authMessage").classList.remove("hidden");$("authMessage").style.color=error?"#b42318":"#0f766e"}
function setMode(reg){registerMode=reg;$("authTitle").textContent=reg?"Tạo tài khoản hộ kinh doanh":"Đăng nhập";$("authSubmit").textContent=reg?"Đăng ký":"Đăng nhập";$("registerFields").classList.toggle("hidden",!reg);$("confirmWrap").classList.toggle("hidden",!reg);$("forgotBtn").classList.toggle("hidden",reg);$("switchBtn").textContent=reg?"Đã có tài khoản? Đăng nhập":"Chưa có tài khoản? Đăng ký";$("authMessage").classList.add("hidden")}
$("switchBtn").onclick=()=>setMode(!registerMode);
function fberr(c){return({
  'auth/email-already-in-use':'Email này đã được đăng ký.',
  'auth/invalid-email':'Email không hợp lệ.',
  'auth/weak-password':'Mật khẩu phải có ít nhất 6 ký tự.',
  'auth/invalid-credential':'Email hoặc mật khẩu không đúng.',
  'auth/user-not-found':'Không tìm thấy tài khoản.',
  'auth/wrong-password':'Email hoặc mật khẩu không đúng.',
  'auth/too-many-requests':'Có quá nhiều lần thử. Vui lòng thử lại sau.',
  'auth/unauthorized-domain':'Tên miền GitHub Pages chưa được thêm vào Firebase Authentication → Settings → Authorized domains.',
  'auth/operation-not-allowed':'Firebase Authentication chưa bật phương thức Email/Password.',
  'auth/network-request-failed':'Không kết nối được Firebase. Hãy kiểm tra mạng.',
  'auth/configuration-not-found':'Cấu hình Firebase Authentication chưa hoàn tất.',
  'permission-denied':'Firestore từ chối quyền truy cập. Hãy kiểm tra Firestore Rules.',
  'failed-precondition':'Firestore chưa được tạo hoặc chưa sẵn sàng.'
}[c]||`Không thể thực hiện (${c||'unknown-error'}). Vui lòng kiểm tra Firebase.`)}
async function authSubmit(e){
  e.preventDefault();
  if(!auth){msg('Firebase chưa sẵn sàng. Hãy kiểm tra firebase-config.js.',true);return}
  let email=$("authEmail").value.trim(),pass=$("authPassword").value;
  try{
    if(registerMode){
      if(pass!==$("authConfirm").value){msg('Mật khẩu nhập lại không khớp.',true);return}
      let name=$("regName").value.trim()||'Hộ kinh doanh';
      let c=await createUserWithEmailAndPassword(auth,email,pass);
      currentUser=c.user;
      await updateProfile(c.user,{displayName:name});
      state.settings.name=name;
      state.settings.tax=$("regTax").value.trim();
      localStorage.setItem('hkd_'+c.user.uid,JSON.stringify(state));
      try { await sendEmailVerification(c.user); } catch (ve) { console.warn('Không gửi được email xác thực:', ve); }
      msg('Đăng ký thành công! Bạn đã được đăng nhập. Nếu muốn đồng bộ dữ liệu lên Firebase, hãy xác thực email theo thư Firebase đã gửi.');
    }else{
      let c=await signInWithEmailAndPassword(auth,email,pass);
      currentUser=c.user;
      msg(c.user.emailVerified?'Đăng nhập thành công.':'Đăng nhập thành công. Email chưa xác thực; dữ liệu vẫn được lưu trên máy, sau khi xác thực sẽ đồng bộ Firebase.');
    }
  }catch(e){
    console.error('Firebase Auth error',e);
    msg(fberr(e.code),true);
  }
}
$("authForm").onsubmit=authSubmit;
$("forgotBtn").onclick=async()=>{let e=$("authEmail").value.trim();if(!e)return msg('Nhập email trước.',true);try{await sendPasswordResetEmail(auth,e);msg('Đã gửi email đặt lại mật khẩu.')}catch(x){msg(fberr(x.code),true)}};
async function saveCloud(){
  if(!currentUser) throw new Error('NO_AUTH_USER');
  localStorage.setItem('hkd_'+currentUser.uid,JSON.stringify(state));
  if(db){
    try{ await currentUser.reload(); currentUser=auth.currentUser; }catch{}
    if(!currentUser?.emailVerified) return true;
    await setDoc(doc(db,'hkd_users',currentUser.uid),{...state,updatedAt:serverTimestamp()},{merge:true});
  }
  return true;
}
async function loadCloud(){
  if(!currentUser) return;
  try{
    if(db){
      let s=await getDoc(doc(db,'hkd_users',currentUser.uid));
      if(s.exists()){
        let d=s.data();
        state={...state,...d,settings:{...state.settings,...(d.settings||{})},transactions:Array.isArray(d.transactions)?d.transactions:[],costs:Array.isArray(d.costs)?d.costs:[],inventory:Array.isArray(d.inventory)?d.inventory:[],cash:Array.isArray(d.cash)?d.cash:[],taxDeadlines:Array.isArray(d.taxDeadlines)?d.taxDeadlines:[]};
      }else{
        let local=localStorage.getItem('hkd_'+currentUser.uid);
        if(local){try{state={...state,...JSON.parse(local),inventory:Array.isArray(JSON.parse(local).inventory)?JSON.parse(local).inventory:state.inventory,cash:Array.isArray(JSON.parse(local).cash)?JSON.parse(local).cash:state.cash}}catch{}}
        await saveCloud();
      }
    }
  }catch(e){
    console.error('Firestore load error',e);
    let local=localStorage.getItem('hkd_'+currentUser.uid);
    if(local){try{state={...state,...JSON.parse(local),inventory:Array.isArray(JSON.parse(local).inventory)?JSON.parse(local).inventory:state.inventory,cash:Array.isArray(JSON.parse(local).cash)?JSON.parse(local).cash:state.cash}}catch{}}
    msg(fberr(e.code||'permission-denied'),true);
  }
}
function showApp(){$("authView").classList.add('hidden');$("appView").classList.remove('hidden');render();if(!state.settings.group)setTimeout(openSetup,350)}
function showAuth(){$("appView").classList.add('hidden');$("authView").classList.remove('hidden')}
function openSetup(){let g=state.settings.group||"";document.querySelectorAll('input[name="group"]').forEach(x=>x.checked=x.value===String(g));$("methodBox").classList.toggle('hidden',g!=='2');document.querySelectorAll('input[name="method"]').forEach(x=>x.checked=x.value===state.settings.method);$("setupBusinessType").value=state.settings.businessType||'goods';updateRatePreview();$("setupModal").classList.remove('hidden')}
function updateRatePreview(){let r=RATES[$("setupBusinessType").value];$("ratePreview").innerHTML=`<b>Tỷ lệ theo bảng đã cấu hình</b><br>GTGT: <strong>${r.gtgt*100}%</strong><br>TNCN: <strong>${r.tncn*100}%</strong>`}
document.querySelectorAll('input[name="group"]').forEach(x=>x.onchange=()=>{$("methodBox").classList.toggle('hidden',x.value!=='2');if(x.value==='1')document.querySelectorAll('input[name="method"]').forEach(y=>y.checked=false)});$("setupBusinessType").onchange=updateRatePreview;
$("setupForm").onsubmit=async e=>{e.preventDefault();let g=document.querySelector('input[name="group"]:checked')?.value;if(!g)return alert('Hãy chọn Nhóm 1 hoặc Nhóm 2.');let m=g==='2'?document.querySelector('input[name="method"]:checked')?.value:'';if(g==='2'&&!m)return alert('Hãy chọn Cách 1 hoặc Cách 2.');state.settings.group=g;state.settings.method=m;state.settings.businessType=$("setupBusinessType").value;try{await saveCloud();close('setupModal');render();alert('Đã lưu thiết lập hộ kinh doanh.')}catch(err){console.error('Lưu thiết lập lỗi:',err);let code=err.code||err.message||'unknown-error';alert('Không lưu được lên Firebase.\n\n'+fberr(code)+'\n\nDữ liệu đã được lưu tạm trên máy.\nNếu vẫn lỗi, hãy kiểm tra Firestore Database và Rules.');}}
function calc(){let y=Number(state.settings.year)||now.getFullYear(), rev=state.transactions.filter(t=>t.date.startsWith(y+'-')).reduce((s,t)=>s+Number(t.amount),0), costs=state.costs.filter(t=>t.date.startsWith(y+'-')).reduce((s,t)=>s+Number(t.amount),0),r=RATES[state.settings.businessType]||RATES.goods;let gtgt=rev*r.gtgt,tncn=0;if(state.settings.group==='2'){if(state.settings.method==='revenue')tncn=Math.max(0,rev-1000000000)*r.tncn;else tncn=Math.max(0,rev-costs)*.15}return{rev,costs,gtgt,tncn,total:gtgt+tncn,r}}
function render(){let y=Number(state.settings.year)||now.getFullYear(),c=calc();const bizName=state.settings.name||'Hộ kinh doanh';$("businessTitle").textContent=bizName;const bh=$("businessHeader");if(bh)bh.querySelector("span:last-child").textContent=bizName;$("businessSub").textContent=state.settings.group==='1'?`Nhóm 1 · S1a-HKD · Năm ${y}`:`Nhóm 2 · ${state.settings.method==='revenue'?'Cách 1 – S2a-HKD':'Cách 2 – S2b/S2c/S2d/S2e-HKD'} · Năm ${y}`;$("totalRevenue").textContent=money(c.rev);$("yearRevenue").textContent=`Năm ${y}`;let q=Math.floor(now.getMonth()/3)+1,qrev=state.transactions.filter(t=>{let d=new Date(t.date);return d.getFullYear()===now.getFullYear()&&Math.floor(d.getMonth()/3)+1===q}).reduce((s,t)=>s+Number(t.amount),0);$("quarterRevenue").textContent=money(qrev);$("quarterLabel").textContent=`Quý ${q}/${now.getFullYear()}`;$("totalCost").textContent=money(c.costs);$("costLabel").textContent=state.settings.group==='2'&&state.settings.method==='income'?'Chi phí hợp lý':'Không áp dụng';$("totalTax").textContent=money(c.total);$("taxLabel").textContent=`GTGT ${money(c.gtgt)} · TNCN ${money(c.tncn)}`;renderTaxCards(c);renderTabs();renderLedger();renderCosts();renderBars(y);renderCalendar();fillPrintYears();renderNotice()}
function renderTaxCards(c){let g=state.settings.group;if(!g){$("taxCards").innerHTML='<div class="empty">Chưa thiết lập nhóm. Bấm ⚙️ để bắt đầu.</div>';return}let method=g==='1'?'S1a-HKD':state.settings.method==='revenue'?'S2a-HKD':'S2b-HKD + S2c-HKD + S2d-HKD + S2e-HKD';$("taxCards").innerHTML=`<div class="tax-card"><span>Nhóm</span><b>${g==='1'?'Nhóm 1':'Nhóm 2'}</b><small>${method}</small></div><div class="tax-card"><span>Ngành nghề</span><b>${esc(c.r.name)}</b><small>GTGT ${c.r.gtgt*100}% · TNCN theo ngành ${c.r.tncn*100}%</small></div><div class="tax-card"><span>Thuế GTGT dự tính</span><b>${money(c.gtgt)}</b><small>Doanh thu × tỷ lệ GTGT</small></div><div class="tax-card"><span>Thuế TNCN dự tính</span><b>${money(c.tncn)}</b><small>${g==='2'&&state.settings.method==='income'?'(Doanh thu − Chi phí hợp lý) × 15%':g==='2'?'(Doanh thu − 1 tỷ) × tỷ lệ TNCN':'Không áp dụng trong màn hình Nhóm 1'}</small></div>`}
function renderTabs(){let tabs=state.settings.group==='1'?[['revenue','S1a-HKD · Doanh thu']]:state.settings.method==='revenue'?[['revenue','S2a-HKD · Doanh thu']]:[['revenue','S2b-HKD · Doanh thu'],['cost','S2c-HKD · Doanh thu, chi phí'],['inventory','S2d-HKD · Vật liệu/hàng hóa'],['cash','S2e-HKD · Tiền']];$("ledgerTabs").innerHTML=tabs.map(([id,t])=>`<button class="tab ${activeLedger===id?'active':''}" data-ledger="${id}">${t}</button>`).join('');document.querySelectorAll('[data-ledger]').forEach(b=>b.onclick=()=>{activeLedger=b.dataset.ledger;renderTabs();renderLedger()});$("costPanel").classList.toggle('hidden',!(state.settings.group==='2'&&state.settings.method==='income'));}
function renderLedger(){if(activeLedger==='inventory'){return renderInventory()}if(activeLedger==='cash'){return renderCash()}let s=$("searchBox").value.toLowerCase(),mon=$("monthFilter").value,y=Number(state.settings.year);if(activeLedger==='cost'){return renderCosts()}let arr=state.transactions.filter(t=>t.date.startsWith(y+'-'));if(mon)arr=arr.filter(t=>t.date.startsWith(mon));if(s)arr=arr.filter(t=>t.desc.toLowerCase().includes(s));arr.sort((a,b)=>a.date.localeCompare(b.date));$("ledgerHead").innerHTML='<tr><th>STT</th><th>Ngày</th><th>Giao dịch</th><th class="right">Số tiền</th><th>Thao tác</th></tr>';$("ledgerBody").innerHTML=arr.map((t,i)=>`<tr><td>${i+1}</td><td>${fmtDate(t.date)}</td><td>${esc(t.desc)}</td><td class="right">${money(t.amount)}</td><td><button class="icon-btn" onclick="editTx('${t.id}')">✏️</button> <button class="icon-btn" onclick="deleteTx('${t.id}')">🗑️</button></td></tr>`).join('');$("ledgerFoot").innerHTML=`<tr><td colspan="3">TỔNG CỘNG</td><td class="right">${money(arr.reduce((s,t)=>s+Number(t.amount),0))}</td><td></td></tr>`;$("emptyState").classList.toggle('hidden',arr.length>0);$("ledgerTitle").textContent=state.settings.group==='1'?'📒 S1a-HKD':state.settings.method==='revenue'?'📒 S2a-HKD':activeLedger==='revenue'?'📒 S2b-HKD':activeLedger==='cost'?'📒 S2c-HKD':activeLedger==='inventory'?'📒 S2d-HKD':'📒 S2e-HKD';$("ledgerDesc").textContent=state.settings.group==='1'?'Sổ chi tiết doanh thu bán hàng hóa, dịch vụ':state.settings.method==='revenue'?'Sổ doanh thu bán hàng hóa, dịch vụ':'Bộ sổ kế toán Nhóm 2 – Cách 2'}
function renderCosts(){let arr=[...state.costs].sort((a,b)=>a.date.localeCompare(b.date));$("costBody").innerHTML=arr.map((t,i)=>`<tr><td>${i+1}</td><td>${fmtDate(t.date)}</td><td>${esc(t.doc)}</td><td>${esc(t.desc)}</td><td>${esc(t.category)}</td><td class="right">${money(t.amount)}</td><td><button class="icon-btn" onclick="editCost('${t.id}')">✏️</button> <button class="icon-btn" onclick="deleteCost('${t.id}')">🗑️</button></td></tr>`).join('');$("costTotal").textContent=money(arr.reduce((s,t)=>s+Number(t.amount),0))}
function ensureInventoryModal(){
  if($("inventoryModal"))return;
  document.body.insertAdjacentHTML('beforeend',`<div id="inventoryModal" class="modal hidden"><div class="modal-card"><div class="modal-head"><h3>📦 Nhập / Xuất vật tư, hàng hóa</h3><button class="icon-btn" data-close="inventoryModal">×</button></div><form id="inventoryForm"><input type="hidden" id="invId"><label>Ngày<input id="invDate" type="date" required></label><label>Số chứng từ<input id="invDoc" placeholder="PN001, PX001..."></label><label>Vật tư / sản phẩm / hàng hóa<input id="invItem" required placeholder="Ví dụ: Xi măng PCB40"></label><label>Đơn vị tính<input id="invUnit" required placeholder="kg, bao, m3, cái..." value="cái"></label><label>Loại nghiệp vụ<select id="invType"><option value="in">Nhập</option><option value="out">Xuất</option></select></label><label>Số lượng<input id="invQty" type="number" min="0" step="0.001" required></label><label>Đơn giá<input id="invPrice" type="number" min="0" step="1" required></label><div class="form-actions"><button type="button" class="btn secondary" data-close="inventoryModal">Hủy</button><button class="btn primary">💾 Lưu</button></div></form></div></div>`);
  $("inventoryForm").onsubmit=saveInventory;
  document.querySelectorAll('[data-close="inventoryModal"]').forEach(b=>b.onclick=()=>close('inventoryModal'));
}
function openInventory(){ensureInventoryModal();$("invId").value='';$("invDate").value=today;$("invDoc").value='';$("invItem").value='';$("invUnit").value='cái';$("invType").value='in';$("invQty").value='';$("invPrice").value='';$("inventoryModal").classList.remove('hidden')}
async function saveInventory(e){e.preventDefault();let id=$("invId").value||uid(),row={id,date:$("invDate").value,doc:$("invDoc").value.trim(),item:$("invItem").value.trim(),unit:$("invUnit").value.trim(),type:$("invType").value,qty:Number($("invQty").value)||0,unitPrice:Number($("invPrice").value)||0};if(!row.date||!row.item||row.qty<=0){alert('Vui lòng nhập ngày, vật tư/hàng hóa và số lượng.');return}let i=state.inventory.findIndex(x=>x.id===id);if(i>=0)state.inventory[i]=row;else state.inventory.push(row);try{await saveCloud();close('inventoryModal');renderInventory()}catch(err){alert('Không lưu được dữ liệu nhập/xuất: '+fberr(err.code||err.message))}}
function inventoryBalances(){let map={};[...state.inventory].sort((a,b)=>a.date.localeCompare(b.date)||(a.doc||'').localeCompare(b.doc||'')).forEach(x=>{let k=x.item+'|'+x.unit;if(!map[k])map[k]={item:x.item,unit:x.unit,qty:0,value:0};let q=Number(x.qty)||0,v=q*(Number(x.unitPrice)||0);if(x.type==='in'){map[k].qty+=q;map[k].value+=v}else{map[k].qty-=q;map[k].value-=v}});return map}
function renderInventory(){ensureInventoryModal();let y=Number(state.settings.year);let arr=state.inventory.filter(t=>t.date.startsWith(y+'-')).sort((a,b)=>a.date.localeCompare(b.date));let s=$("searchBox").value.toLowerCase(),mon=$("monthFilter").value;if(mon)arr=arr.filter(t=>t.date.startsWith(mon));if(s)arr=arr.filter(t=>t.item.toLowerCase().includes(s)||t.doc.toLowerCase().includes(s));let running={};let rows=arr.map((t,i)=>{let k=t.item+'|'+t.unit;if(!running[k])running[k]={qty:0,value:0};let openQ=running[k].qty,openV=running[k].value,q=Number(t.qty)||0,v=q*(Number(t.unitPrice)||0),inQ=t.type==='in'?q:0,inV=t.type==='in'?v:0,outQ=t.type==='out'?q:0,outV=t.type==='out'?v:0;running[k].qty+=inQ-outQ;running[k].value+=inV-outV;return `<tr><td>${i+1}</td><td>${esc(t.doc||'')}</td><td>${fmtDate(t.date)}</td><td>${esc(t.item)}</td><td>${esc(t.unit)}</td><td class="right">${inQ?num(inQ):''}</td><td class="right">${inV?num(inV):''}</td><td class="right">${outQ?num(outQ):''}</td><td class="right">${outV?num(outV):''}</td><td class="right">${num(running[k].qty)}</td><td class="right">${num(running[k].value)}</td><td><button class="icon-btn" onclick="editInventory('${t.id}')">✏️</button> <button class="icon-btn" onclick="deleteInventory('${t.id}')">🗑️</button></td></tr>`}).join('');$("ledgerHead").innerHTML='<tr><th rowspan="2">Số hiệu</th><th rowspan="2">Ngày, tháng</th><th rowspan="2">Diễn giải</th><th rowspan="2">Đơn vị tính</th><th colspan="2">Nhập</th><th colspan="2">Xuất</th><th colspan="2">Tồn</th><th rowspan="2">Thao tác</th></tr><tr><th>Số lượng</th><th>Thành tiền</th><th>Số lượng</th><th>Thành tiền</th><th>Số lượng</th><th>Thành tiền</th></tr>';$('ledgerBody').innerHTML=rows;$('ledgerFoot').innerHTML='<tr><td colspan="11">Sổ chi tiết vật tư, dụng cụ, sản phẩm, hàng hóa – theo dõi nhập, xuất, tồn</td></tr>';$('emptyState').classList.toggle('hidden',arr.length>0);$('ledgerTitle').textContent='📦 S2d-HKD · Sổ chi tiết vật tư, dụng cụ, sản phẩm, hàng hóa';$('ledgerDesc').innerHTML='Theo dõi nhập – xuất – tồn theo từng vật tư/hàng hóa. <button class="btn primary" id="addInventoryBtn">＋ Thêm nhập/xuất</button>';$("addInventoryBtn").onclick=openInventory}
window.editInventory=id=>{let t=state.inventory.find(x=>x.id===id);if(!t)return;ensureInventoryModal();$("invId").value=t.id;$("invDate").value=t.date;$("invDoc").value=t.doc||'';$("invItem").value=t.item;$("invUnit").value=t.unit;$("invType").value=t.type;$("invQty").value=t.qty;$("invPrice").value=t.unitPrice;$("inventoryModal").classList.remove('hidden')};window.deleteInventory=async id=>{if(!confirm('Xóa dòng nhập/xuất này?'))return;state.inventory=state.inventory.filter(x=>x.id!==id);await saveCloud();renderInventory()};
function ensureCashModal(){
  if($('cashModal'))return;
  document.body.insertAdjacentHTML('beforeend',`<div id="cashModal" class="modal hidden"><div class="modal-card"><div class="modal-head"><h3>💵 Thu / Chi tiền</h3><button class="icon-btn" data-close="cashModal">×</button></div><form id="cashForm"><input type="hidden" id="cashId"><label>Ngày<input id="cashDate" type="date" required></label><label>Số chứng từ<input id="cashDoc" placeholder="PT001, PC001, GBC001..."></label><label>Loại tài khoản<select id="cashAccount"><option value="cash">Tiền mặt</option><option value="bank">Tiền gửi ngân hàng</option></select></label><label>Loại nghiệp vụ<select id="cashType"><option value="in">Thu tiền</option><option value="out">Chi tiền</option></select></label><label>Nội dung<input id="cashDesc" required placeholder="Thu tiền bán hàng, chi mua hàng..."></label><label>Số tiền<input id="cashAmount" type="number" min="1" required></label><div class="form-actions"><button type="button" class="btn secondary" data-close="cashModal">Hủy</button><button class="btn primary">💾 Lưu</button></div></form></div></div>`);
  $('cashForm').onsubmit=saveCash;
  document.querySelectorAll('[data-close="cashModal"]').forEach(b=>b.onclick=()=>close('cashModal'));
}
function openCash(){ensureCashModal();$('cashId').value='';$('cashDate').value=today;$('cashDoc').value='';$('cashAccount').value='cash';$('cashType').value='in';$('cashDesc').value='';$('cashAmount').value='';$('cashModal').classList.remove('hidden')}
async function saveCash(e){e.preventDefault();let row={id:$('cashId').value||uid(),date:$('cashDate').value,doc:$('cashDoc').value.trim(),account:$('cashAccount').value,type:$('cashType').value,desc:$('cashDesc').value.trim(),amount:Number($('cashAmount').value)||0};if(!row.date||!row.desc||row.amount<=0)return alert('Vui lòng nhập đủ ngày, nội dung và số tiền.');let i=state.cash.findIndex(x=>x.id===row.id);if(i>=0)state.cash[i]=row;else state.cash.push(row);try{await saveCloud();close('cashModal');renderCash()}catch(err){alert('Không lưu được sổ tiền: '+fberr(err.code||err.message))}}
function renderCash(){let y=Number(state.settings.year),s=$('searchBox').value.toLowerCase(),mon=$('monthFilter').value;let arr=state.cash.filter(t=>t.date.startsWith(y+'-')).sort((a,b)=>a.date.localeCompare(b.date));if(mon)arr=arr.filter(t=>t.date.startsWith(mon));if(s)arr=arr.filter(t=>(t.desc||'').toLowerCase().includes(s)||(t.doc||'').toLowerCase().includes(s));let cash=0,bank=0;let rows=arr.map((t,i)=>{let v=Number(t.amount)||0;if(t.account==='cash')cash+=t.type==='in'?v:-v;else bank+=t.type==='in'?v:-v;return `<tr><td>${i+1}</td><td>${fmtDate(t.date)}</td><td>${esc(t.account==='cash'?'Tiền mặt':'Ngân hàng')}</td><td>${esc(t.type==='in'?'Thu':'Chi')}</td><td>${esc(t.desc)}</td><td class="right">${money(v)}</td><td><button class="icon-btn" onclick="editCash('${t.id}')">✏️</button> <button class="icon-btn" onclick="deleteCash('${t.id}')">🗑️</button></td></tr>`}).join('');$('ledgerHead').innerHTML='<tr><th>STT</th><th>Ngày</th><th>Tài khoản</th><th>Thu/Chi</th><th>Diễn giải</th><th class="right">Số tiền</th><th>Thao tác</th></tr>';$('ledgerBody').innerHTML=rows;$('ledgerFoot').innerHTML=`<tr><td colspan="5"><b>Số dư biến động tiền mặt</b></td><td class="right"><b>${money(cash)}</b></td><td></td></tr><tr><td colspan="5"><b>Số dư biến động tiền gửi</b></td><td class="right"><b>${money(bank)}</b></td><td></td></tr>`;$('emptyState').classList.toggle('hidden',arr.length>0);$('ledgerTitle').textContent='📒 S2e-HKD · Sổ chi tiết tiền';$('ledgerDesc').innerHTML=`Theo dõi riêng tiền mặt và tiền gửi ngân hàng. <button type="button" class="btn primary" id="addCashBtn">＋ Thêm thu/chi</button>`;$('addCashBtn').onclick=openCash}
window.editCash=id=>{let t=state.cash.find(x=>x.id===id);if(!t)return;ensureCashModal();$('cashId').value=t.id;$('cashDate').value=t.date;$('cashDoc').value=t.doc||'';$('cashAccount').value=t.account||'cash';$('cashType').value=t.type||'in';$('cashDesc').value=t.desc||'';$('cashAmount').value=t.amount||'';$('cashModal').classList.remove('hidden')};window.deleteCash=async id=>{if(!confirm('Xóa giao dịch thu/chi này?'))return;state.cash=state.cash.filter(x=>x.id!==id);await saveCloud();renderCash()}
function renderBars(y){let vals=Array.from({length:12},(_,i)=>state.transactions.filter(t=>t.date.startsWith(`${y}-${pad(i+1)}`)).reduce((s,t)=>s+Number(t.amount),0));let max=Math.max(...vals,1);$("monthlyStats").innerHTML=vals.map((v,i)=>`<div class="bar-col"><div class="bar-value">${v?num(v):''}</div><div class="bar" style="height:${Math.max(2,v/max*160)}px"></div><div class="bar-label">T${i+1}</div></div>`).join('')}
function getTaxEvents(){
  const y=Number(state.settings.year)||now.getFullYear();
  let events=[];
  if(state.settings.group==='1'){
    events=[{id:`notice-${y}`,date:`${y}-01-31`,title:`Thông báo doanh thu năm ${y}`,form:'01/TKN-CNKD',desc:'Thông báo doanh thu theo năm. Không khai số thuế GTGT, TNCN trên mẫu thông báo.'}];
  }else if(state.settings.group==='2'){
    const qs=[['Q1',4,30],['Q2',7,31],['Q3',10,31]];
    qs.forEach(([q,m,d])=>events.push({id:`${y}-${q}`,date:`${y}-${pad(m)}-${pad(d)}`,title:`Khai thuế ${q}/${y}`,form:'01/CNKD',desc:'Khai GTGT và TNCN theo quý.'}));
    events.push({id:`${y}-Q4`,date:`${y+1}-01-31`,title:`Khai thuế Q4/${y}`,form:'01/CNKD',desc:'Khai GTGT và TNCN theo quý; hạn vào ngày cuối tháng đầu quý sau.'});
    if(state.settings.method==='income') events.push({id:`settlement-${y}`,date:`${y+1}-03-31`,title:`Quyết toán TNCN năm ${y}`,form:'02/CNKD-TNCN-QTT',desc:'Quyết toán thuế TNCN năm đối với Cách 2.'});
  }
  return events;
}
function renderCalendar(){
  const events=getTaxEvents();
  if(!events.length){$("taxCalendar").innerHTML='<div class="empty">Hãy thiết lập Nhóm 1 hoặc Nhóm 2 để app tự tạo lịch thuế theo từng kỳ báo cáo.</div>';return}
  const stored=Array.isArray(state.taxDeadlines)?state.taxDeadlines:[];
  const todayMs=new Date(today+'T00:00:00').getTime();
  $("taxCalendar").innerHTML=events.map(e=>{
    const done=stored.includes(e.id),d=new Date(e.date+'T00:00:00'),days=Math.ceil((d-new Date(today+'T00:00:00'))/86400000);
    let cls=done?'done':days<0?'overdue':days<=15?'soon':'upcoming';
    let status=done?'✅ Đã hoàn thành':days<0?'🔴 Đã quá hạn '+Math.abs(days)+' ngày':days===0?'🔴 Hôm nay':days<=15?'🟡 Còn '+days+' ngày':'🔵 Còn '+days+' ngày';
    return `<div class="deadline ${cls}"><div class="deadline-date"><b>${d.getDate()}</b><small>${pad(d.getMonth()+1)}/${d.getFullYear()}</small></div><div class="deadline-main"><b>${e.title}</b><p><strong>${e.form}</strong> · ${e.desc}</p><span class="countdown">${status}</span></div><button class="btn ${done?'secondary':'primary'} tax-done-btn" onclick="toggleTaxDone('${e.id}')">${done?'↩ Chưa hoàn thành':'✓ Đã nộp/đã thông báo'}</button></div>`;
  }).join('');
}
window.toggleTaxDone=async id=>{state.taxDeadlines=Array.isArray(state.taxDeadlines)?state.taxDeadlines:[];if(state.taxDeadlines.includes(id))state.taxDeadlines=state.taxDeadlines.filter(x=>x!==id);else state.taxDeadlines.push(id);try{await saveCloud()}catch(e){}renderCalendar();renderNotice()};
function renderNotice(){
  const events=getTaxEvents();
  if(!events.length){$("taxNotice").value='Hãy thiết lập Nhóm kinh doanh để tạo thông báo nhắc thuế.';return}
  const done=Array.isArray(state.taxDeadlines)?state.taxDeadlines:[];
  const todayMs=new Date(today+'T00:00:00').getTime();
  const pending=events.filter(e=>!done.includes(e.id)).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const e=pending.find(x=>new Date(x.date+'T00:00:00').getTime()>=todayMs)||pending[pending.length-1]||events[events.length-1];
  const c=calc(),d=new Date(e.date+'T00:00:00');
  $("taxNotice").value=`🔔 NHẮC NGHĨA VỤ THUẾ\n=============================\n🏠 ${state.settings.name||'Hộ kinh doanh'}\n📋 Kỳ: ${e.title}\n📄 Mẫu: ${e.form}\n📅 Hạn nộp: ${d.getDate()}/${pad(d.getMonth()+1)}/${d.getFullYear()}\n\n💰 Doanh thu: ${num(c.rev)} đ\n📋 Chi phí hợp lý: ${num(c.costs)} đ\n📊 GTGT dự tính: ${num(c.gtgt)} đ\n📊 TNCN dự tính: ${num(c.tncn)} đ\n⚡ Tổng thuế dự tính: ${num(c.total)} đ\n\n📌 Việc cần làm:\n1. Kiểm tra sổ doanh thu/chi phí\n2. Lập ${e.form}\n3. Nộp hồ sơ và thuế đúng hạn\n4. Lưu chứng từ\n\n⚠️ Lịch được tạo tự động theo Nhóm/Phương pháp và năm đã cài đặt trong app.`;
}
function fillPrintYears(){let ys=new Set([now.getFullYear(),Number(state.settings.year),...state.transactions.map(t=>Number(t.date.slice(0,4)))]);$("printYear").innerHTML=[...ys].filter(Boolean).sort((a,b)=>b-a).map(y=>`<option>${y}</option>`).join('');$("printYear").value=state.settings.year}
function openTx(){ $("txModal").classList.remove('hidden');$("txDate").value=today;$("txDesc").value='';$("txAmount").value='';$("txId").value=''}
function parseAmt(s){return Number(String(s).replace(/[^\d]/g,''))||0}
$("addRevenueBtn").onclick=openTx;
$("txForm").onsubmit=async e=>{e.preventDefault();let t={id:$("txId").value||uid(),date:$("txDate").value,desc:$("txDesc").value.trim(),amount:parseAmt($("txAmount").value)};if(!t.date||!t.desc||!t.amount)return alert('Vui lòng nhập đủ thông tin.');state.transactions.push(t);await saveCloud();close('txModal');render()};
$("txAmount").oninput=e=>{let n=parseAmt(e.target.value);e.target.value=n?new Intl.NumberFormat('vi-VN').format(n):''};
window.editTx=x=>{let t=state.transactions.find(a=>a.id===x);if(!t)return;$("txModal").classList.remove('hidden');$("txId").value=t.id;$("txDate").value=t.date;$("txDesc").value=t.desc;$("txAmount").value=num(t.amount)};window.deleteTx=async x=>{if(confirm('Xóa giao dịch này?')){state.transactions=state.transactions.filter(t=>t.id!==x);await saveCloud();render()}};
$("addCostBtn").onclick=()=>{$("costModal").classList.remove('hidden');$("costId").value='';$("costDate").value=today;$("costDoc").value='';$("costDesc").value='';$("costAmount").value=''};
$("costAmount").oninput=e=>{let n=parseAmt(e.target.value);e.target.value=n?new Intl.NumberFormat('vi-VN').format(n):''};
$("costForm").onsubmit=async e=>{e.preventDefault();let t={id:$("costId").value||uid(),date:$("costDate").value,doc:$("costDoc").value.trim(),desc:$("costDesc").value.trim(),category:$("costCategory").value,amount:parseAmt($("costAmount").value)};if(!t.date||!t.desc||!t.amount)return alert('Vui lòng nhập đủ thông tin.');let i=state.costs.findIndex(x=>x.id===t.id);i>=0?state.costs[i]=t:state.costs.push(t);await saveCloud();close('costModal');render()};
window.editCost=x=>{let t=state.costs.find(a=>a.id===x);if(!t)return;$("costModal").classList.remove('hidden');$("costId").value=t.id;$("costDate").value=t.date;$("costDoc").value=t.doc;$("costDesc").value=t.desc;$("costCategory").value=t.category;$("costAmount").value=num(t.amount)};window.deleteCost=async x=>{if(confirm('Xóa chi phí này?')){state.costs=state.costs.filter(t=>t.id!==x);await saveCloud();render()}};
$("searchBox").oninput=renderLedger;$("monthFilter").oninput=renderLedger;$("clearFilter").onclick=()=>{$("searchBox").value='';$("monthFilter").value='';renderLedger()};
$("setupBtn").onclick=openSetup;$("settingsBtn").onclick=()=>{$("setName").value=state.settings.name;$("setTax").value=state.settings.tax;$("setAddress").value=state.settings.address;$("setLocation").value=state.settings.location;$("setYear").value=state.settings.year;$("setRep").value=state.settings.rep;$("settingsModal").classList.remove('hidden')};
$("settingsForm").onsubmit=async e=>{e.preventDefault();state.settings={...state.settings,name:$("setName").value.trim(),tax:$("setTax").value.trim(),address:$("setAddress").value.trim(),location:$("setLocation").value.trim(),year:Number($("setYear").value)||now.getFullYear(),rep:$("setRep").value.trim()};await saveCloud();close('settingsModal');render()};
function setupPrintBooks(){const el=$("printBook");if(!el)return;let books=state.settings.group==='1'?[['s1a','S1a-HKD – Sổ doanh thu']]:state.settings.method==='revenue'?[['s2a','S2a-HKD – Sổ doanh thu']]:[['s2b','S2b-HKD – Sổ doanh thu'],['s2c','S2c-HKD – Sổ chi tiết doanh thu, chi phí'],['s2d','S2d-HKD – Sổ chi tiết vật tư, dụng cụ, sản phẩm, hàng hóa'],['s2e','S2e-HKD – Sổ chi tiết tiền']];el.innerHTML=books.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('');el.value=activeLedger==='inventory'?'s2d':activeLedger==='cost'?'s2c':'s'+(state.settings.group==='1'?'1a':state.settings.method==='revenue'?'2a':'2b')}$("helpBtn").onclick=()=>$('helpModal').classList.remove('hidden');$("printBtn").onclick=()=>{setupPrintBooks();$("printModal").classList.remove('hidden')};$("printType").onchange=()=>{let q=$("printType").value;$("printMonthWrap").classList.toggle('hidden',q!=='month');$("printQuarterWrap").classList.toggle('hidden',q!=='quarter')};
$("doPrintBtn").onclick=()=>{close('printModal');printLedger()};
function printLedger(){
  let type=$("printType").value,y=Number($("printYear").value),arr=[...state.transactions].filter(t=>t.date.startsWith(y+'-'));let label='Năm '+y;
  if(type==='month'){let v=$("printMonth").value;arr=arr.filter(t=>t.date.startsWith(v));label='Tháng '+v.slice(5)+'/'+v.slice(0,4)}
  if(type==='quarter'){let q=Number($("printQuarter").value),st=(q-1)*3+1;arr=arr.filter(t=>{let d=new Date(t.date);return d.getFullYear()===y&&d.getMonth()+1>=st&&d.getMonth()+1<=st+2});label=`Quý ${['I','II','III','IV'][q-1]} năm ${y}`}
  const book=$("printBook")?.value || (state.settings.group==='1'?'s1a':state.settings.method==='revenue'?'s2a':activeLedger==='cost'?'s2c':activeLedger==='inventory'?'s2d':activeLedger==='cash'?'s2e':'s2b');
  if(book==='s1a')return printS1a(arr,label,y);
  if(book==='s2a')return printS2a(arr,label,y);
  if(book==='s2b')return printS2b(arr,label,y);
  if(book==='s2c')return printS2c(arr,label,y);
  if(book==='s2d')return printS2d(label,y);
  if(book==='s2e')return printS2e(label,y);
  let w=open('','_blank');if(!w)return;let total=arr.reduce((s,t)=>s+Number(t.amount),0);
  w.document.write(`<html><head><meta charset="utf-8"><title>Sổ ${esc(label)}</title><style>@page{size:A4;margin:12mm}body{font:13px 'Times New Roman'}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:5px}th{text-align:center}.right{text-align:right}.center{text-align:center}.top{display:grid;grid-template-columns:55% 45%}.sign{text-align:right;margin-top:35px}</style></head><body><div class="top"><div><b>HỌ, CÁ NHÂN KINH DOANH: ${esc(state.settings.name)}</b><br>Mã số thuế: ${esc(state.settings.tax)}<br>Địa chỉ: ${esc(state.settings.address)}</div><div class="center"><b>Mẫu số ${state.settings.group==='1'?'S1a-HKD':state.settings.method==='revenue'?'S2a-HKD':'S2b-HKD'}</b><br>(Theo mẫu sổ đang sử dụng)</div></div><h2 class="center">SỔ DOANH THU BÁN HÀNG HÓA, DỊCH VỤ</h2><div class="center">Địa điểm kinh doanh: ${esc(state.settings.location)}<br>Kỳ kê khai: ${esc(label)}</div><table><thead><tr><th>STT</th><th>Ngày tháng</th><th>Giao dịch</th><th>Số tiền</th></tr></thead><tbody>${arr.map((t,i)=>`<tr><td class="center">${i+1}</td><td>${fmtDate(t.date)}</td><td>${esc(t.desc)}</td><td class="right">${num(t.amount)}</td></tr>`).join('')||'<tr><td colspan="4" class="center">Không phát sinh</td></tr>'}</tbody><tfoot><tr><th colspan="3">TỔNG CỘNG</th><th class="right">${num(total)}</th></tr></tfoot></table><div class="sign">Ngày ..... tháng ..... năm ${y}<br><b>NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/<br>CÁ NHÂN KINH DOANH</b><br>(Ký, họ tên, đóng dấu)<br><br>${esc(state.settings.rep)}</div><script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);w.document.close()
}
function inSelectedPrintPeriod(date,y){const type=$("printType")?.value||'year';if(!date.startsWith(String(y)+'-'))return false;if(type==='year')return true;if(type==='month'){const m=$("printMonth")?.value;return !!m&&date.startsWith(m)}if(type==='quarter'){const q=Number($("printQuarter")?.value||1),d=new Date(date);const m=d.getMonth()+1;return Math.ceil(m/3)===q}return true}
function printS1a(arr,label,y){
  const total=arr.reduce((s,t)=>s+Number(t.amount||0),0);let w=open('','_blank');if(!w)return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Mẫu S1a-HKD</title><style>@page{size:A4 portrait;margin:12mm 14mm}body{font:12px "Times New Roman";color:#000}.head{display:grid;grid-template-columns:45% 55%;margin-bottom:8px}.right{text-align:center}.title{text-align:center;font-weight:bold;font-size:15px}.sub{text-align:center;margin:4px 0 10px}.unit{text-align:right;font-style:italic}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:5px}th{text-align:center}.r{text-align:right}.c{text-align:center}.sign{text-align:right;margin-top:25px}</style></head><body><div class="head"><div><b>HỌ, CÁ NHÂN KINH DOANH:</b> ${esc(state.settings.name)}<br>Địa chỉ: ${esc(state.settings.address||'................................')}<br>Mã số thuế: ${esc(state.settings.tax||'................................')}</div><div class="right"><b>Mẫu số S1a-HKD</b><br><i>(Theo mẫu sổ kế toán hộ, cá nhân kinh doanh)</i></div></div><div class="title">SỔ DOANH THU BÁN HÀNG HÓA, DỊCH VỤ</div><div class="sub">Địa điểm kinh doanh: ${esc(state.settings.location||'........................')}<br>Kỳ kê khai: ${esc(label)}</div><div class="unit">Đơn vị tính: đồng</div><table><thead><tr><th>STT</th><th>Ngày, tháng</th><th>Diễn giải</th><th>Số tiền</th></tr></thead><tbody>${arr.map((t,i)=>`<tr><td class="c">${i+1}</td><td>${fmtDate(t.date)}</td><td>${esc(t.desc)}</td><td class="r">${num(t.amount)}</td></tr>`).join('')||'<tr><td colspan="4" class="c">Không phát sinh</td></tr>'}</tbody><tfoot><tr><th colspan="3">TỔNG CỘNG</th><th class="r">${num(total)}</th></tr></tfoot></table><div class="sign">Ngày ..... tháng ..... năm ${y}<br><b>NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/<br>CÁ NHÂN KINH DOANH</b><br><i>(Ký, ghi rõ họ tên và đóng dấu (nếu có))</i><br><br>${esc(state.settings.rep||'')}</div><script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);w.document.close()
}
function printS2b(arr,label,y){
  const rate=RATES[state.settings.businessType]||RATES.goods,revenue=arr.reduce((s,t)=>s+Number(t.amount||0),0),gtgt=revenue*rate.gtgt;let w=open('','_blank');if(!w)return;
  const rows=arr.map(t=>`<tr><td>${esc(t.doc||'')}</td><td>${fmtDate(t.date)}</td><td>${esc(t.desc||'Doanh thu')}</td><td class="r">${num(t.amount)}</td></tr>`).join('')||'<tr><td></td><td></td><td></td><td></td></tr>';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Mẫu S2b-HKD</title><style>@page{size:A4 portrait;margin:12mm 14mm}body{font:12px "Times New Roman"}.head{display:grid;grid-template-columns:45% 55%;margin-bottom:8px}.right{text-align:center}.title{text-align:center;font-weight:bold;font-size:15px}.sub{text-align:center;margin:3px 0 10px}.unit{text-align:right;font-style:italic}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:4px 5px}th{text-align:center}.r{text-align:right}.c{text-align:center}.sign{text-align:right;margin-top:20px}.b td{font-weight:bold}</style></head><body><div class="head"><div><b>HỌ, CÁ NHÂN KINH DOANH:</b> ${esc(state.settings.name)}<br>Địa chỉ: ${esc(state.settings.address||'................')}<br>Mã số thuế: ${esc(state.settings.tax||'................')}</div><div class="right"><b>Mẫu số S2b-HKD</b><br><i>(Kèm theo Thông tư số 152/2025/TT-BTC<br>ngày 31 tháng 12 năm 2025 của Bộ trưởng Bộ Tài chính)</i></div></div><div class="title">SỔ DOANH THU BÁN HÀNG HÓA, DỊCH VỤ</div><div class="sub">Địa điểm kinh doanh: ${esc(state.settings.location||'................')}<br>Kỳ kê khai: ${esc(label)}</div><div class="unit">Đơn vị tính: đồng</div><table><thead><tr><th>Số hiệu</th><th>Ngày, tháng</th><th>Diễn giải</th><th>Số tiền</th></tr></thead><tbody><tr><td></td><td></td><td>1. Ngành nghề: ${esc(rate.name)}</td><td></td></tr>${rows}<tr class="b"><td colspan="3" class="c">Tổng cộng (1)</td><td class="r">${num(revenue)}</td></tr><tr><td colspan="3" class="c">Thuế GTGT</td><td class="r">${num(gtgt)}</td></tr></tbody><tfoot><tr class="b"><td colspan="3" class="c">Tổng số thuế GTGT phải nộp</td><td class="r">${num(gtgt)}</td></tr></tfoot></table><div class="sign">Ngày ..... tháng ..... năm ${y}<br><b>NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/<br>CÁ NHÂN KINH DOANH</b><br><i>(Ký, ghi rõ họ tên và đóng dấu (nếu có))</i><br><br>${esc(state.settings.rep||'')}</div><script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);w.document.close()
}
function printS2c(arr,label,y){
  const costs=state.costs.filter(t=>inSelectedPrintPeriod(t.date,y)).sort((a,b)=>a.date.localeCompare(b.date));
  const revenue=arr.reduce((s,t)=>s+Number(t.amount||0),0),costTotal=costs.reduce((s,t)=>s+Number(t.amount||0),0),income=Math.max(0,revenue-costTotal),tncn=income*0.15;
  const costRows=costs.map(t=>`<tr><td>${esc(t.doc||'')}</td><td>${fmtDate(t.date)}</td><td>${esc(t.desc||'')}</td><td class="r">${num(t.amount)}</td></tr>`).join('');let w=open('','_blank');if(!w)return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Mẫu S2c-HKD</title><style>@page{size:A4 portrait;margin:12mm 14mm}body{font:11.5px "Times New Roman"}.head{display:grid;grid-template-columns:45% 55%}.right{text-align:center}.title{text-align:center;font-weight:bold;font-size:15px;margin:8px}.sub{text-align:center}.unit{text-align:right;font-style:italic;margin:8px 0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:4px}th{text-align:center}.r{text-align:right}.c{text-align:center}.b{font-weight:bold}.sign{text-align:right;margin-top:20px}</style></head><body><div class="head"><div><b>HỌ, CÁ NHÂN KINH DOANH:</b> ${esc(state.settings.name)}<br>Địa chỉ: ${esc(state.settings.address||'...............')}<br>Mã số thuế: ${esc(state.settings.tax||'...............')}</div><div class="right"><b>Mẫu số S2c-HKD</b><br><i>(Kèm theo Thông tư số 152/2025/TT-BTC)</i></div></div><div class="title">SỔ CHI TIẾT DOANH THU, CHI PHÍ</div><div class="sub">Tên địa điểm kinh doanh: ${esc(state.settings.location||'...............')}<br>Kỳ kê khai: ${esc(label)}</div><div class="unit">Đơn vị tính: đồng</div><table><thead><tr><th>Số hiệu</th><th>Ngày, tháng</th><th>Diễn giải</th><th>Số tiền</th></tr></thead><tbody><tr class="b"><td></td><td></td><td>1. Doanh thu bán hàng hóa, dịch vụ</td><td class="r">${num(revenue)}</td></tr><tr class="b"><td></td><td></td><td>2. Chi phí hợp lý</td><td class="r">${num(costTotal)}</td></tr>${costRows||'<tr><td></td><td></td><td><i>Chưa phát sinh chi phí</i></td><td class="r">0</td></tr>'}<tr class="b"><td></td><td></td><td>3. Chênh lệch {(3) = (1) - (2)}</td><td class="r">${num(income)}</td></tr><tr class="b"><td></td><td></td><td>4. Tổng số thuế TNCN phải nộp {(4) = (3) × 15%}</td><td class="r">${num(tncn)}</td></tr></tbody></table><div class="sign">Ngày ..... tháng ..... năm ${y}<br><b>NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/<br>CÁ NHÂN KINH DOANH</b><br><i>(Ký, ghi rõ họ tên và đóng dấu (nếu có))</i><br><br>${esc(state.settings.rep||'')}</div><script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);w.document.close()
}
function printS2e(label,y){
  // S2e-HKD tách riêng 2 phần: Tiền mặt và Tiền gửi ngân hàng.
  const type=$('printType')?.value||'year';
  let periodStart=`${y}-01-01`, periodEnd=`${y}-12-31`;
  if(type==='month'){
    periodStart=$('printMonth')?.value||`${y}-01`;
    periodEnd=new Date(Number(periodStart.slice(0,4)),Number(periodStart.slice(5,7)),0).toISOString().slice(0,10);
  }else if(type==='quarter'){
    const q=Number($('printQuarter')?.value||1), m=(q-1)*3+1;
    periodStart=`${y}-${String(m).padStart(2,'0')}-01`;
    periodEnd=new Date(y,m+2,0).toISOString().slice(0,10);
  }
  const all=[...state.cash].sort((a,b)=>a.date.localeCompare(b.date));
  const before=all.filter(t=>t.date<periodStart);
  const inPeriod=all.filter(t=>t.date>=periodStart && t.date<=periodEnd);
  const opening={cash:0,bank:0};
  before.forEach(t=>{
    const v=Number(t.amount||0), sign=t.type==='in'?1:-1;
    opening[t.account==='bank'?'bank':'cash']+=sign*v;
  });
  const cashRows=inPeriod.filter(t=>(t.account||'cash')==='cash');
  const bankRows=inPeriod.filter(t=>t.account==='bank');
  const totals=rows=>rows.reduce((a,t)=>{
    const v=Number(t.amount||0);
    if(t.type==='in') a.in+=v; else a.out+=v;
    return a;
  },{in:0,out:0});
  const ct=totals(cashRows), bt=totals(bankRows);
  const cashEnd=opening.cash+ct.in-ct.out, bankEnd=opening.bank+bt.in-bt.out;
  const row=(t)=>`<tr><td>${esc(t.doc||'')}</td><td>${fmtDate(t.date)}</td><td>${esc(t.desc||'')}</td><td class="r">${t.type==='in'?num(t.amount):''}</td><td class="r">${t.type==='out'?num(t.amount):''}</td></tr>`;
  const cashDetail=cashRows.map(row).join('')||'<tr><td></td><td></td><td>...</td><td></td><td></td></tr>';
  const bankDetail=bankRows.map(row).join('')||'<tr><td></td><td></td><td>...</td><td></td><td></td></tr>';
  let w=open('','_blank');
  if(!w){alert('Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup cho trang này.');return;}
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Mẫu S2e-HKD</title><style>
  @page{size:A4 portrait;margin:12mm 14mm}body{font:12px "Times New Roman",serif;color:#000}
  .head{display:grid;grid-template-columns:45% 55%}.right{text-align:center}.title{text-align:center;font-weight:bold;font-size:15px;margin:8px}.sub{text-align:center}.unit{text-align:right;font-style:italic;margin:8px 0}
  table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #000;padding:4px;vertical-align:middle}th{text-align:center}.r{text-align:right}.c{text-align:center}.section td{font-weight:bold}.total td{font-weight:bold}.bank-title td{font-weight:bold}.sign{text-align:right;margin-top:20px}
  </style></head><body>
  <div class="head"><div><b>HỌ, CÁ NHÂN KINH DOANH:</b> ${esc(state.settings.name)}<br>Địa chỉ: ${esc(state.settings.address||'...............')}<br>Mã số thuế: ${esc(state.settings.tax||'...............')}</div>
  <div class="right"><b>Mẫu số S2e-HKD</b><br><i>(Kèm theo Thông tư số 152/2025/TT-BTC<br>ngày 31 tháng 12 năm 2025 của Bộ trưởng Bộ Tài chính)</i></div></div>
  <div class="title">SỔ CHI TIẾT TIỀN</div><div class="sub">Kỳ kê khai: ${esc(label)}</div><div class="unit">Đơn vị tính: đồng</div>
  <table><thead><tr><th colspan="2">Chứng từ</th><th>Diễn giải</th><th colspan="2">Số tiền</th></tr><tr><th>Số hiệu</th><th>Ngày tháng</th><th></th><th>Thu/Ghi vào</th><th>Chi/Rút ra</th></tr><tr><th>A</th><th>B</th><th>C</th><th>1</th><th>2</th></tr></thead><tbody>
  <tr class="section"><td></td><td></td><td>Tiền mặt</td><td></td><td></td></tr>
  <tr><td></td><td></td><td>Tiền mặt đầu kỳ</td><td colspan="2" class="r">${num(opening.cash)}</td></tr>
  ${cashDetail}
  <tr class="total"><td></td><td></td><td>Tổng tiền thu vào trong kỳ</td><td class="r">${num(ct.in)}</td><td></td></tr>
  <tr class="total"><td></td><td></td><td>Tổng tiền chi ra trong kỳ</td><td></td><td class="r">${num(ct.out)}</td></tr>
  <tr class="total"><td></td><td></td><td>Tiền mặt cuối kỳ</td><td colspan="2" class="r">${num(cashEnd)}</td></tr>
  <tr class="bank-title"><td></td><td></td><td>Tiền gửi không kỳ hạn</td><td></td><td></td></tr>
  <tr class="bank-title"><td></td><td></td><td><i>Ngân hàng...</i></td><td></td><td></td></tr>
  <tr><td></td><td></td><td>Tiền gửi đầu kỳ</td><td colspan="2" class="r">${num(opening.bank)}</td></tr>
  ${bankDetail}
  <tr class="total"><td></td><td></td><td>Tổng gửi vào trong kỳ</td><td class="r">${num(bt.in)}</td><td></td></tr>
  <tr class="total"><td></td><td></td><td>Tổng tiền rút ra trong kỳ</td><td></td><td class="r">${num(bt.out)}</td></tr>
  <tr class="total"><td></td><td></td><td>Tiền gửi cuối kỳ</td><td colspan="2" class="r">${num(bankEnd)}</td></tr>
  <tr class="bank-title"><td></td><td></td><td><i>Ngân hàng...</i></td><td></td><td></td></tr>
  <tr><td></td><td></td><td>...</td><td></td><td></td></tr>
  </tbody></table>
  <div class="sign">Ngày ..... tháng ..... năm ${y}<br><b>NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/<br>CÁ NHÂN KINH DOANH</b><br><i>(Ký, ghi rõ họ tên và đóng dấu (nếu có))</i><br><br>${esc(state.settings.rep||'')}</div>
  <script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}
function printS2a(arr,label,y){
  const rate=RATES[state.settings.businessType]||RATES.goods,revenue=arr.reduce((s,t)=>s+Number(t.amount||0),0),gtgt=revenue*rate.gtgt,tncn=Math.max(0,revenue-1000000000)*rate.tncn,total=gtgt+tncn;
  const rows=arr.map(t=>`<tr><td>${esc(t.doc||'')}</td><td>${fmtDate(t.date)}</td><td>${esc(t.desc||'Doanh thu')}</td><td class="money">${num(t.amount)}</td></tr>`).join('')||'<tr><td></td><td></td><td></td><td></td></tr>';
  let w=open('','_blank');if(!w)return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Mẫu S2a-HKD</title><style>@page{size:A4 portrait;margin:12mm 14mm 14mm}body{font-family:"Times New Roman",serif;color:#000;font-size:12px;margin:0}.head{display:grid;grid-template-columns:45% 55%;margin-bottom:8px}.left{line-height:1.45}.right{text-align:center;line-height:1.35}.right b{font-size:14px}.title{text-align:center;font-weight:bold;font-size:15px;line-height:1.35}.sub{text-align:center;margin:2px 0 10px}.unit{text-align:right;font-style:italic;margin-bottom:3px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #000;padding:4px 5px;vertical-align:middle}th{text-align:center;font-weight:bold}.c1{width:16%}.c2{width:17%}.c3{width:47%}.c4{width:20%}.money{text-align:right}.section td{height:20px}.sum td{font-weight:bold}.tax td:first-child,.total-tax td:first-child{font-weight:bold}.total-tax td{font-weight:bold}.sign{margin-top:20px;text-align:right}.note{font-size:10px;margin-top:6px}.center{text-align:center}</style></head><body><div class="head"><div class="left"><b>HỌ, CÁ NHÂN KINH DOANH:</b> ${esc(state.settings.name)}<br><b>Địa chỉ:</b> ${esc(state.settings.address||'................................')}<br><b>Mã số thuế:</b> ${esc(state.settings.tax||'................................')}</div><div class="right"><b>Mẫu số S2a-HKD</b><br><i>(Kèm theo Thông tư số 152/2025/TT-BTC<br>ngày 31 tháng 12 năm 2025 của Bộ trưởng<br>Bộ Tài chính)</i></div></div><div class="title">SỔ DOANH THU BÁN HÀNG HÓA, DỊCH VỤ</div><div class="sub">Địa điểm kinh doanh: ${esc(state.settings.location||'........................')}<br>Kỳ kê khai: ${esc(label)}</div><div class="unit">Đơn vị tính: đồng</div><table><thead><tr><th colspan="2">Chứng từ</th><th rowspan="2" class="c3">Diễn giải</th><th rowspan="2" class="c4">Số tiền</th></tr><tr><th class="c1">Số hiệu</th><th class="c2">Ngày, tháng</th></tr></thead><tbody><tr class="section"><td></td><td></td><td>1. Ngành nghề: ${esc(rate.name)}</td><td></td></tr>${rows}<tr class="sum"><td></td><td></td><td class="center">Tổng cộng (1)</td><td class="money">${num(revenue)}</td></tr><tr><td></td><td></td><td class="center">Thuế GTGT</td><td class="money">${num(gtgt)}</td></tr><tr><td></td><td></td><td class="center">Thuế TNCN</td><td class="money">${num(tncn)}</td></tr><tr class="section"><td></td><td></td><td>2. Ngành nghề: ........................................................</td><td></td></tr><tr class="sum"><td></td><td></td><td class="center">Tổng cộng (2)</td><td></td></tr><tr><td></td><td></td><td class="center">Thuế GTGT</td><td></td></tr><tr><td></td><td></td><td class="center">Thuế TNCN</td><td></td></tr><tr class="section"><td></td><td></td><td>3. Ngành nghề: ........................................................</td><td></td></tr><tr class="sum"><td></td><td></td><td class="center">Tổng cộng (3)</td><td></td></tr><tr><td></td><td></td><td class="center">Thuế GTGT</td><td></td></tr><tr><td></td><td></td><td class="center">Thuế TNCN</td><td></td></tr><tr class="total-tax"><td></td><td></td><td class="center">Tổng số thuế GTGT phải nộp</td><td class="money">${num(gtgt)}</td></tr><tr class="total-tax"><td></td><td></td><td class="center">Tổng số thuế TNCN phải nộp</td><td class="money">${num(tncn)}</td></tr></tbody></table><div class="sign">Ngày ..... tháng ..... năm ${y}<br><b>NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/<br>CÁ NHÂN KINH DOANH</b><br><i>(Ký, ghi rõ họ tên và đóng dấu (nếu có))</i><br><br>${esc(state.settings.rep||'')}</div><div class="note">* Số thuế được tự động tính theo doanh thu và tỷ lệ ngành nghề đã cài đặt trong ứng dụng.</div><script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);w.document.close()
}
function printS2d(label,y){
  const arr=state.inventory.filter(t=>inSelectedPrintPeriod(t.date,y)).sort((a,b)=>a.item.localeCompare(b.item)||a.date.localeCompare(b.date));
  let groups={};arr.forEach(t=>{let k=t.item+'|'+t.unit;(groups[k]??=[]).push(t)});
  let blocks='';Object.values(groups).forEach(g=>{let runQ=0,runV=0;let rows=g.map(t=>{let q=Number(t.qty)||0,v=q*(Number(t.unitPrice)||0),iq=t.type==='in'?q:0,iv=t.type==='in'?v:0,oq=t.type==='out'?q:0,ov=t.type==='out'?v:0;runQ+=iq-oq;runV+=iv-ov;return `<tr><td>${esc(t.doc||'')}</td><td>${fmtDate(t.date)}</td><td>${esc(t.type==='in'?'Nhập: '+t.item:'Xuất: '+t.item)}</td><td>${esc(t.unit)}</td><td class="r">${iq?num(iq):''}</td><td class="r">${iv?num(iv):''}</td><td class="r">${oq?num(oq):''}</td><td class="r">${ov?num(ov):''}</td><td class="r">${num(runQ)}</td><td class="r">${num(runV)}</td></tr>`}).join('');blocks+=rows});
  let w=open('','_blank');if(!w)return;w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Mẫu S2d-HKD</title><style>@page{size:A4 landscape;margin:10mm}body{font:11px "Times New Roman";color:#000}.head{display:grid;grid-template-columns:50% 50%;margin-bottom:8px}.right{text-align:center}.title{text-align:center;font-weight:bold;font-size:15px}.sub{text-align:center;margin:3px 0 8px}.unit{text-align:right;font-style:italic}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #000;padding:4px;vertical-align:middle}th{text-align:center}.r{text-align:right}.sign{text-align:right;margin-top:20px}</style></head><body><div class="head"><div><b>HỌ, CÁ NHÂN KINH DOANH:</b> ${esc(state.settings.name)}<br>Địa chỉ: ${esc(state.settings.address||'........................')}<br>Mã số thuế: ${esc(state.settings.tax||'........................')}</div><div class="right"><b>Mẫu số S2d-HKD</b><br><i>(Kèm theo Thông tư số 152/2025/TT-BTC<br>ngày 31 tháng 12 năm 2025 của Bộ trưởng Bộ Tài chính)</i></div></div><div class="title">SỔ CHI TIẾT VẬT LIỆU, DỤNG CỤ, SẢN PHẨM, HÀNG HÓA</div><div class="sub">Tên vật tư, sản phẩm, hàng hóa: Theo từng mặt hàng<br>Kỳ kê khai: ${esc(label)}</div><div class="unit">Đơn vị tính: theo từng mặt hàng</div><table><thead><tr><th rowspan="2">Số hiệu</th><th rowspan="2">Ngày, tháng</th><th rowspan="2">Diễn giải</th><th rowspan="2">Đơn vị tính</th><th colspan="2">Nhập</th><th colspan="2">Xuất</th><th colspan="2">Tồn</th></tr><tr><th>Số lượng</th><th>Thành tiền</th><th>Số lượng</th><th>Thành tiền</th><th>Số lượng</th><th>Thành tiền</th></tr></thead><tbody>${blocks||'<tr><td colspan="10" style="text-align:center">Không phát sinh</td></tr>'}</tbody></table><div class="sign">Ngày ..... tháng ..... năm ${y}<br><b>NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/<br>CÁ NHÂN KINH DOANH</b><br><i>(Ký, ghi rõ họ tên và đóng dấu (nếu có))</i><br><br>${esc(state.settings.rep||'')}</div><script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);w.document.close()
}
$("exportJsonBtn").onclick=()=>download(`so-hkd-${state.settings.year}.json`,JSON.stringify(state,null,2),'application/json');function download(n,t,type){let b=new Blob([t],{type}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=n;a.click();URL.revokeObjectURL(a.href)}
$("exportCsvBtn").onclick=()=>{let rows=[['Ngày','Loại','Nội dung','Số tiền'],...state.transactions.map(t=>[fmtDate(t.date),'Doanh thu',t.desc,t.amount]),...state.costs.map(t=>[fmtDate(t.date),'Chi phí',t.desc,t.amount])];download(`so-hkd-${state.settings.year}.csv`,'\uFEFF'+rows.map(r=>r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv')};$("importJsonBtn").onclick=()=>$("jsonFile").click();$("jsonFile").onchange=async e=>{try{let x=JSON.parse(await e.target.files[0].text());state={...state,...x,settings:{...state.settings,...(x.settings||{})},transactions:x.transactions||[],costs:x.costs||[],inventory:x.inventory||[],cash:x.cash||[]};await saveCloud();render();alert('Đã nhập dữ liệu')}catch{alert('File JSON không hợp lệ')}e.target.value=''};
$("refreshNoticeBtn").onclick=renderNotice;$("copyNoticeBtn").onclick=async()=>{await navigator.clipboard.writeText($("taxNotice").value);alert('Đã sao chép thông báo')};$("showQrBtn").onclick=()=>$("qrModal").classList.remove('hidden');$("logoutBtn").onclick=async()=>{await signOut(auth);};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>close(b.dataset.close));function close(id){$(id).classList.add('hidden')};document.querySelectorAll('.bottom-nav button').forEach(b=>b.onclick=()=>{let a=b.dataset.action;if(a==='add')openTx();if(a==='cost'){activeLedger='cost';renderTabs();renderCosts();document.getElementById('costPanel').scrollIntoView({behavior:'smooth'})}if(a==='print')$("printModal").classList.remove('hidden');if(a==='settings')openSetup()});
async function init(){
  let cfg=window.FIREBASE_SETTINGS;
  if(!cfg?.ENABLE_FIREBASE || !cfg?.firebaseConfig?.apiKey || cfg.firebaseConfig.apiKey==='YOUR_API_KEY'){
    $("authSubmit").disabled=true;
    msg('Firebase chưa được cấu hình. Hãy kiểm tra file firebase-config.js.',true);
    return;
  }
  try{
    let app=initializeApp(cfg.firebaseConfig);
    auth=getAuth(app);
    db=getFirestore(app);
    $("authSubmit").disabled=false;
    onAuthStateChanged(auth,async u=>{
      currentUser=u;
      if(!u){showAuth();return;}
      await loadCloud();
      showApp();
    });
  }catch(e){
    console.error('Firebase init error',e);
    msg(`Không khởi tạo được Firebase (${e.code||'unknown-error'}). Kiểm tra firebase-config.js.`,true);
  }
}
init();
