"use client";
// สถานะการ Sync → last section: how each platform is connected straight to its own API, with
// which brands are on the API now (from the latest run's sources). Steps only: no tokens,
// codes or links here.
import { useState } from "react";
import type { FetchStat } from "@/lib/sync/sourceMatrix";

const used = (s: FetchStat) => (s.fetched || 0) > 0 && !s.error;
const brands = (list: FetchStat[]) => [...new Set(list.map((s) => s.brand))];

export function SyncApiGuide({ sources }: { sources?: FetchStat[] }) {
  const [open, setOpen] = useState(false);
  const s = sources || [];
  const ytApi = brands(s.filter((x) => x.network === "youtube-data-api" && used(x)));
  const ttApi = brands(s.filter((x) => x.network === "tiktok-api" && x.source === "api"));
  const ttMetricool = brands(s.filter((x) => x.network === "tiktok" && used(x))).filter((b) => !ttApi.includes(b));
  const fb = brands(s.filter((x) => (x.network === "facebook" || x.network === "fbreels") && used(x)));
  const ig = brands(s.filter((x) => (x.network === "instagram" || x.network === "reels") && used(x)));
  const join = (l: string[]) => (l.length ? l.join(", ") : "–");

  return (
    <>
      <h3>
        วิธีต่อ API ตรง (YouTube · TikTok · Facebook · Instagram)
        <button className="sync-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? "ซ่อน" : "ดูวิธี"}
        </button>
      </h3>
      {open && (
        <div className="sync-api-guide">
          {sources && (
            <table>
              <tbody>
                <tr>
                  <th>YouTube</th>
                  <td>
                    <span className="ok">✅ API ตรง:</span> {join(ytApi)}
                  </td>
                </tr>
                <tr>
                  <th>TikTok</th>
                  <td>
                    <span className="ok">✅ API ตรง:</span> {join(ttApi)}
                    {ttMetricool.length > 0 && (
                      <>
                        <br />
                        <span className="muted">⚪ ผ่าน Metricool:</span> {join(ttMetricool)}
                      </>
                    )}
                  </td>
                </tr>
                <tr>
                  <th>Facebook</th>
                  <td>
                    <span className="muted">⚪ ผ่าน Metricool:</span> {join(fb)} · ยังไม่มี API ตรง
                  </td>
                </tr>
                <tr>
                  <th>Instagram</th>
                  <td>
                    <span className="muted">⚪ ผ่าน Metricool:</span> {join(ig)} · ยังไม่มี API ตรง
                  </td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="sync-note">สถานะจาก sync รอบล่าสุด · ต่อบัญชีใหม่แล้วจะขึ้นเองในรอบถัดไป</p>

          <h4>YouTube (เจ้าของช่องไม่ต้องกดอะไร)</h4>
          <ol>
            <li>ช่องต้องอยู่ใน CMS ของ TERO DIGITAL</li>
            <li>ส่ง Channel ID ของช่อง (ขึ้นต้นด้วย UC…) ให้ผู้ดูแลระบบ เพื่อใส่ในการตั้งค่าแบรนด์</li>
            <li>sync รอบถัดไปดึงยอดวิวและคลิปให้เอง ส่วนเวลาดูและรายได้ดึงผ่าน CMS</li>
          </ol>

          <h4>TikTok (เจ้าของบัญชีต้องกดอนุญาต)</h4>
          <ol>
            <li>ผู้ดูแลระบบสร้างลิงก์ขออนุญาต (scripts/tiktok-auth.mjs url)</li>
            <li>เจ้าของบัญชี TikTok ล็อกอินและกด "อนุญาต" ในลิงก์นั้น</li>
            <li>ผู้ดูแลระบบนำรหัสที่ได้ไปแลกเป็น token และบันทึกเข้าระบบ (exchange → save) · ห้ามส่งลิงก์หลังกดอนุญาตทางแชต</li>
            <li>ทดสอบเทียบกับ Metricool แล้วจึงให้ sync รายวันใช้</li>
          </ol>
          <p className="sync-note">⚠️ สิทธิ์มีอายุ 1 ปี ต้องให้เจ้าของบัญชีกดอนุญาตใหม่ก่อนหมดอายุ</p>

          <h4>Facebook / Instagram (ยังไม่มี ต้องพัฒนาเพิ่ม)</h4>
          <ol>
            <li>
              แอดมินของ Meta Business Manager สร้าง Meta App และ System User token · สิทธิ์: pages_show_list, pages_read_engagement, read_insights,
              instagram_basic, instagram_manage_insights, business_management
            </li>
            <li>เก็บ token ไว้ใน GitHub Secrets (ห้ามส่งทางแชต)</li>
            <li>พัฒนาตัวดึงข้อมูล แล้วทดสอบเทียบกับ Metricool 1 สัปดาห์ ก่อนเปลี่ยนมาใช้</li>
          </ol>

          <p className="sync-note">ทำไมต้องต่อตรง: ได้ตัวเลขเร็วและตรงกว่า Metricool (บางวัน Metricool ส่งข้อมูลช้า 1 วัน)</p>
        </div>
      )}
    </>
  );
}
