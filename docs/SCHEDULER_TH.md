# ให้ Dokploy สั่งรัน sync ตรงเวลา

GitHub Actions เริ่มงานที่ตั้งเวลาไว้ (`schedule:`) ช้าได้หลายชั่วโมง เพราะงานต้องรอคิวรวมของ GitHub
แต่ถ้าสั่ง "Run workflow" ผ่าน API งานจะเริ่มภายในไม่กี่วินาที จึงให้เซิร์ฟเวอร์ Dokploy ซึ่งเปิดอยู่ตลอดเป็นคนสั่งตามเวลา

| งาน | เวลาไทย | cron (UTC) | workflow |
|---|---|---|---|
| Data sync | 05:17 | `17 22 * * *` | `data-sync.yml` (mode=write) |
| Backup | 11:47 | `47 4 * * *` | `backup.yml` |

cron ใน `schedule:` ของ GitHub ยังเปิดไว้เป็นตัวสำรอง ถ้ามีรอบที่ Dokploy สั่งสำเร็จหรือกำลังรันอยู่ในช่วง 20 ชั่วโมงที่ผ่านมา
รอบสำรองจะข้ามตัวเอง (ดูได้จากงาน `gate` ใน Actions) แต่ถ้ารอบของ Dokploy ไม่ได้รันหรือล้มเหลว รอบสำรองจะรันให้

## 1. สร้าง GitHub token (ทำครั้งเดียว · ประมาณปีละครั้ง)

1. GitHub → รูปโปรไฟล์ → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
2. ตั้งค่าตามนี้
   - Token name: `dokploy-dispatch`
   - Expiration: 1 ปี (จดวันหมดอายุไว้ และสร้าง token ใหม่ก่อนถึงวันนั้น)
   - Repository access: **Only select repositories** → เลือก repo ของ dashboard
   - Permissions → Repository permissions → **Actions: Read and write** (Metadata: Read จะติ๊กให้เอง)
3. กด Generate แล้วคัดลอก token ไปใช้ในขั้นที่ 2 เลย **ห้ามวาง token ในแชท, commit หรือส่งในไฟล์**

token นี้ทำได้แค่สั่งรันหรืออ่านสถานะ workflow ของ repo นี้ อ่านโค้ดหรือ secrets ไม่ได้

## 2. เก็บ token ไว้บนเซิร์ฟเวอร์ Dokploy

เปิด Terminal ของเซิร์ฟเวอร์ (Dokploy → Server → Terminal หรือ SSH) แล้วรันคำสั่งนี้

```bash
mkdir -p /root/.config/tero && read -rsp "GitHub token: " T && echo "$T" > /root/.config/tero/gh-dispatch-token && chmod 600 /root/.config/tero/gh-dispatch-token && unset T && echo " saved"
```

ระบบจะถามให้วาง token โดยไม่แสดงบนจอ และไม่เก็บลงประวัติคำสั่ง

## 3. ตั้งเวลาใน Dokploy

ใช้เมนูตั้งเวลาของ Dokploy (**Schedules / Schedule Jobs** ระดับ Server) เพิ่ม 2 งาน
ถ้า Dokploy ให้เลือก timezone ให้เลือก UTC แล้วใช้ cron ตามตารางด้านบน
ถ้าตั้งเป็น Asia/Bangkok ให้ใช้ `17 5 * * *` และ `47 11 * * *` แทน

**งานที่ 1: Data sync**

```bash
curl -fsS -X POST -H "Authorization: Bearer $(cat /root/.config/tero/gh-dispatch-token)" -H "Accept: application/vnd.github+json" https://api.github.com/repos/exthanet/exthanet-Dashboard/actions/workflows/data-sync.yml/dispatches -d '{"ref":"main","inputs":{"mode":"write","trigger":"scheduler"}}' && echo dispatched
```

**งานที่ 2: Backup**

```bash
curl -fsS -X POST -H "Authorization: Bearer $(cat /root/.config/tero/gh-dispatch-token)" -H "Accept: application/vnd.github+json" https://api.github.com/repos/exthanet/exthanet-Dashboard/actions/workflows/backup.yml/dispatches -d '{"ref":"main","inputs":{"trigger":"scheduler"}}' && echo dispatched
```

ถ้าเมนูนี้ไม่มีใน Dokploy ให้ใช้ crontab ของเซิร์ฟเวอร์แทน (`crontab -e`) โดยใส่ cron ตามตารางนำหน้าคำสั่งแต่ละบรรทัด

## 4. ทดสอบ

รันคำสั่งของงานที่ 2 (Backup) ด้วยมือหนึ่งครั้ง ถ้าขึ้น `dispatched` ให้ดูใน GitHub → Actions
จะเห็นรายการชื่อ **"Backup (scheduler)"** เริ่มภายในไม่ถึงนาที

ใช้ Backup ทดสอบเพราะไม่เขียนอะไรลง Firestore
ไม่ต้องทดสอบ Data sync ด้วยมือ ให้รอดูรอบ 05:17 ของวันถัดไป

ถ้าขึ้น error
- `401` / `403` = token ผิด, หมดอายุ หรือไม่ได้ให้สิทธิ์ Actions: Read and write
- `404` = ชื่อ repo หรือชื่อไฟล์ workflow ผิด (repo ถูกย้ายชื่อ ต้องแก้ URL)
- `422` = ชื่อ input ไม่ตรงกับ workflow บน main
