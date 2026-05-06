import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import "./App.css";

const APPLICATION_TEMPLATE = {
  loanCycle: "",
  lastLoanAvailed: "",
  personalData: "",
  name: "",
  nickname: "",
  homeAddress: "",
  phone: "",
  identificationNo: "",
  idType: "",
  birthDate: "",
  sex: "",
  dependents: "",
  civilStatus: "",
  spouseName: "",
  spouseOccupation: "",
  companyName: "",
  businessAddress: "",
  businessName: "",
  businessLicense: "",
  businessType: "",
  yearsInBusiness: "",
  purposeOfLoan: "",
  amountApplied: "",
  bankAccount: "",
  termValue: "2",
  termUnit: "months",
  pin: "",
  paymentFrequency: "weekly",
  lenderName: "",
  interestRate: "1",
  releaseDate: "",
  applicantSignature: "",
  applicantDatePlace: "",
  makerSignature: "",
  makerDate: "",
  coMaker1Name: "",
  coMaker1Signature: "",
  coMaker1Date: "",
  coMaker2Name: "",
  coMaker2Signature: "",
  coMaker2Date: "",
};

const TERM_DAYS = {
  days: 1,
  weeks: 7,
  months: 30,
};

const FREQUENCY_DAYS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

const FORM_FIELDS = {
  name: "Name",
  nickname: "Nickname",
  phone: "Telephone / Cellphone",
  homeAddress: "Home Address",
  identificationNo: "Identification No.",
  idType: "Type of ID",
  birthDate: "Date of Birth",
  sex: "Sex",
  civilStatus: "Civil Status",
  dependents: "No. of Dependents",
  spouseName: "Spouse Name",
  spouseOccupation: "Spouse Occupation",
  companyName: "Company",
  businessName: "Business Name",
  businessAddress: "Business Address",
  businessLicense: "Business License/Stall Agreement",
  businessType: "Type of Business",
  yearsInBusiness: "No. of Years in Business",
  purposeOfLoan: "Purpose of Loan",
  bankAccount: "Bank Name/Acct#",
  pin: "PIN#",
  loanCycle: "Loan Cycle",
  lastLoanAvailed: "Last/Previous Loan Availed",
  amountApplied: "Amount of Loan Applied",
  termValue: "Term Value",
  lenderName: "Lender's Name",
  interestRate: "Interest Rate (%)",
  releaseDate: "Date Release",
};
const SUPABASE_TABLE = "loan_applications";
const SHOW_CONNECTION_DEBUG = import.meta.env.DEV;
const ADMIN_PASSCODE = import.meta.env.VITE_ADMIN_PASSCODE || "admin123";

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  // Accept user-entered values like "30,000", "₱30,000.00", or "10%".
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") return 0;

  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function addDays(date, days) {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
}

function buildSchedule(values) {
  const principal = Math.max(0, toNumber(values.amountApplied));
  const annualRate = Math.max(0, toNumber(values.interestRate)) / 100;
  const termValue = Math.max(1, toNumber(values.termValue));
  const totalDays = termValue * (TERM_DAYS[values.termUnit] || 30);
  const frequencyDays = FREQUENCY_DAYS[values.paymentFrequency] || 7;
  const numberOfPayments = Math.max(1, Math.ceil(totalDays / frequencyDays));
  const ratePerPayment = annualRate * (frequencyDays / 365);
  const startDate = values.releaseDate ? new Date(values.releaseDate) : new Date();

  let paymentAmount;
  if (ratePerPayment > 0) {
    const growth = Math.pow(1 + ratePerPayment, numberOfPayments);
    paymentAmount = (principal * ratePerPayment * growth) / (growth - 1);
  } else {
    paymentAmount = principal / numberOfPayments;
  }

  let balance = principal;
  const rows = [];

  for (let i = 1; i <= numberOfPayments; i += 1) {
    const interest = balance * ratePerPayment;
    let principalPart = paymentAmount - interest;

    if (i === numberOfPayments) {
      principalPart = balance;
      paymentAmount = principalPart + interest;
    }

    balance = Math.max(0, balance - principalPart);

    rows.push({
      no: i,
      date: formatDate(addDays(startDate, i * frequencyDays)),
      beginningBalance: principalPart + balance,
      payment: paymentAmount,
      principal: principalPart,
      interest,
      endingBalance: balance,
    });
  }

  return {
    principal,
    numberOfPayments,
    paymentAmount,
    totalInterest: rows.reduce((sum, row) => sum + row.interest, 0),
    totalPaid: rows.reduce((sum, row) => sum + row.payment, 0),
    rows,
  };
}

function toDatabaseRecord(values) {
  const { id, createdAt, updatedAt, ...payload } = values;
  return payload;
}

function fromDatabaseRow(row) {
  const payload = row.application_data || {};
  const paymentLogs = Array.isArray(payload.paymentLogs) ? payload.paymentLogs : [];

  return {
    id: row.id,
    ...payload,
    paymentLogs,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function renderFormFields(values, onChange) {
  return (
    <>
      {Object.entries(FORM_FIELDS).map(([field, label]) => (
        <label key={field}>
          <span>{label}</span>
          <input
            name={field}
            value={values[field] || ""}
            onChange={onChange}
            type={field === "releaseDate" || field === "birthDate" ? "date" : "text"}
          />
        </label>
      ))}

      <label>
        <span>Term Unit</span>
        <select name="termUnit" value={values.termUnit || "months"} onChange={onChange}>
          <option value="days">Days</option>
          <option value="weeks">Weeks</option>
          <option value="months">Months</option>
        </select>
      </label>

      <label>
        <span>Mode of Payment</span>
        <select
          name="paymentFrequency"
          value={values.paymentFrequency || "weekly"}
          onChange={onChange}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
    </>
  );
}

function ScheduleSection({ title, schedule }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <div className="summary-grid">
        <article>
          <span>Principal Amount</span>
          <strong>{formatCurrency(schedule.principal)}</strong>
        </article>
        <article>
          <span>Payments</span>
          <strong>{schedule.numberOfPayments}</strong>
        </article>
        <article>
          <span>Estimated Payment / Term</span>
          <strong>{formatCurrency(schedule.paymentAmount)}</strong>
        </article>
        <article>
          <span>Total Interest</span>
          <strong>{formatCurrency(schedule.totalInterest)}</strong>
        </article>
        <article>
          <span>Total Amount to Pay</span>
          <strong>{formatCurrency(schedule.totalPaid)}</strong>
        </article>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Date</th>
              <th>Beg. Balance</th>
              <th>Payment</th>
              <th>Principal</th>
              <th>Interest</th>
              <th>Ending Balance</th>
            </tr>
          </thead>
          <tbody>
            {schedule.rows.map((row) => (
              <tr key={row.no}>
                <td>{row.no}</td>
                <td>{row.date}</td>
                <td>{formatCurrency(row.beginningBalance)}</td>
                <td>{formatCurrency(row.payment)}</td>
                <td>{formatCurrency(row.principal)}</td>
                <td>{formatCurrency(row.interest)}</td>
                <td>{formatCurrency(row.endingBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PrintableApplicationForm({ values, onChange, isReadOnly = false }) {
  const inputProps = (name) => ({
    name,
    value: values[name] || "",
    onChange,
    disabled: isReadOnly,
  });

  return (
    <div className="printable-form">
      <header className="printable-form-header">
        <h3>A&amp;G Financial</h3>
        <p>INDIVIDUAL LOAN APPLICATION</p>
      </header>

      <section className="printable-section">
        <div className="printable-row two-col">
          <label>
            <span>Loan Type</span>
            <input {...inputProps("personalData")} placeholder="New Loan / Reloan" />
          </label>
          <label>
            <span>Loan Cycle / Last Loan Availed</span>
            <input {...inputProps("loanCycle")} placeholder="Cycle / Last Loan Availed" />
          </label>
        </div>
      </section>

      <section className="printable-section">
        <h4>Personal Data</h4>
        <div className="printable-row two-col">
          <label>
            <span>Name</span>
            <input {...inputProps("name")} />
          </label>
          <label>
            <span>Nickname</span>
            <input {...inputProps("nickname")} />
          </label>
        </div>
        <div className="printable-row two-col">
          <label>
            <span>Home Address</span>
            <input {...inputProps("homeAddress")} />
          </label>
          <label>
            <span>Telephone/Cellphone</span>
            <input {...inputProps("phone")} />
          </label>
        </div>
        <div className="printable-row three-col">
          <label>
            <span>Identification No.</span>
            <input {...inputProps("identificationNo")} />
          </label>
          <label>
            <span>Type of ID</span>
            <input {...inputProps("idType")} />
          </label>
          <label>
            <span>Date of Birth</span>
            <input {...inputProps("birthDate")} type="date" />
          </label>
        </div>
        <div className="printable-row three-col">
          <label>
            <span>Sex</span>
            <input {...inputProps("sex")} placeholder="Male / Female" />
          </label>
          <label>
            <span>No. of Dependents</span>
            <input {...inputProps("dependents")} />
          </label>
          <label>
            <span>Civil Status</span>
            <input {...inputProps("civilStatus")} placeholder="Single / Married / Separated / Widower" />
          </label>
        </div>
      </section>

      <section className="printable-section">
        <h4>Business Information</h4>
        <div className="printable-row two-col">
          <label>
            <span>Business Name &amp; Address</span>
            <input {...inputProps("businessAddress")} />
          </label>
          <label>
            <span>Business License/Stall Agreement</span>
            <input {...inputProps("businessLicense")} />
          </label>
        </div>
        <div className="printable-row three-col">
          <label>
            <span>Type of Business</span>
            <input {...inputProps("businessType")} />
          </label>
          <label>
            <span>No. of Years in Business</span>
            <input {...inputProps("yearsInBusiness")} />
          </label>
          <label>
            <span>Amount of Loan Applied</span>
            <input {...inputProps("amountApplied")} />
          </label>
        </div>
        <div className="printable-row three-col">
          <label>
            <span>Purpose of Loan</span>
            <input {...inputProps("purposeOfLoan")} />
          </label>
          <label>
            <span>Term of Loan</span>
            <input {...inputProps("termValue")} placeholder="Value (e.g. 2)" />
          </label>
          <label>
            <span>Mode of Payment</span>
            <input {...inputProps("paymentFrequency")} placeholder="daily / weekly / monthly" />
          </label>
        </div>
        <div className="printable-row two-col">
          <label>
            <span>Bank Name/Acct#</span>
            <input {...inputProps("bankAccount")} />
          </label>
          <label>
            <span>PIN#</span>
            <input {...inputProps("pin")} />
          </label>
        </div>
      </section>

      <section className="printable-section">
        <h4>Authorization</h4>
        <p className="printable-note">
          I confirm that the above information is true and correct to the best of my knowledge. I am
          aware that any false statement may be an immediate cause for denial of this loan. In this
          application, I authorize A&amp;G Financial to disclose such information as may be required.
        </p>
        <div className="printable-row two-col">
          <label>
            <span>Printed Name &amp; Signature of Applicant</span>
            <input {...inputProps("applicantSignature")} placeholder={values.name || ""} />
          </label>
          <label>
            <span>Date/Place</span>
            <input {...inputProps("applicantDatePlace")} />
          </label>
        </div>
      </section>

      <section className="printable-section">
        <h4>Loan Notes</h4>
        <p className="printable-note">
          For value received, we jointly and severally promise to pay A&amp;G Financial, or order, the
          sum of PESOS plus interest and other costs or charges as may reasonably be deemed thereafter
          according to the term stipulated in this application.
        </p>
        <div className="printable-row three-col">
          <label>
            <span>Printed Name of Maker</span>
            <input {...inputProps("name")} />
          </label>
          <label>
            <span>Signature</span>
            <input {...inputProps("makerSignature")} />
          </label>
          <label>
            <span>Date</span>
            <input {...inputProps("makerDate")} />
          </label>
        </div>
        <div className="printable-row three-col">
          <label>
            <span>Printed Name of Co-Maker 1</span>
            <input {...inputProps("coMaker1Name")} />
          </label>
          <label>
            <span>Signature</span>
            <input {...inputProps("coMaker1Signature")} />
          </label>
          <label>
            <span>Date</span>
            <input {...inputProps("coMaker1Date")} />
          </label>
        </div>
        <div className="printable-row three-col">
          <label>
            <span>Printed Name of Co-Maker 2</span>
            <input {...inputProps("coMaker2Name")} />
          </label>
          <label>
            <span>Signature</span>
            <input {...inputProps("coMaker2Signature")} />
          </label>
          <label>
            <span>Date</span>
            <input {...inputProps("coMaker2Date")} />
          </label>
        </div>
      </section>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("intro");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPasscodeInput, setAdminPasscodeInput] = useState("");
  const [showAdminPasscode, setShowAdminPasscode] = useState(false);
  const [adminAccessError, setAdminAccessError] = useState("");
  const [form, setForm] = useState(APPLICATION_TEMPLATE);
  const [savedRecords, setSavedRecords] = useState([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [editForm, setEditForm] = useState(APPLICATION_TEMPLATE);
  const [statusMessage, setStatusMessage] = useState("Loading saved records...");
  const [connectionStatus, setConnectionStatus] = useState("checking");
  const [recordSearch, setRecordSearch] = useState("");
  const [paymentEntry, setPaymentEntry] = useState({
    date: "",
    amount: "",
    notes: "",
  });

  const schedule = useMemo(() => buildSchedule(form), [form]);
  const showComputationTab = useMemo(() => {
    return toNumber(form.amountApplied) > 0 && toNumber(form.termValue) > 0;
  }, [form.amountApplied, form.termValue]);
  const selectedRecord = useMemo(
    () => savedRecords.find((record) => record.id === selectedRecordId),
    [savedRecords, selectedRecordId]
  );
  const selectedSchedule = useMemo(
    () => (selectedRecord ? buildSchedule(selectedRecord) : null),
    [selectedRecord]
  );
  const editSchedule = useMemo(() => buildSchedule(editForm), [editForm]);
  const selectedPaymentLogs = useMemo(() => {
    if (!selectedRecord?.paymentLogs) return [];
    return [...selectedRecord.paymentLogs].sort(
      (a, b) => new Date(a.date || 0) - new Date(b.date || 0)
    );
  }, [selectedRecord]);
  const totalActualPaid = useMemo(
    () => selectedPaymentLogs.reduce((sum, entry) => sum + toNumber(entry.amount), 0),
    [selectedPaymentLogs]
  );
  const remainingBalance = useMemo(() => {
    if (!selectedSchedule) return 0;
    return Math.max(selectedSchedule.totalPaid - totalActualPaid, 0);
  }, [selectedSchedule, totalActualPaid]);
  const filteredRecords = useMemo(() => {
    const keyword = recordSearch.trim().toLowerCase();
    if (!keyword) return savedRecords;
    return savedRecords.filter((record) =>
      `${record.name || ""} ${record.phone || ""} ${record.nickname || ""}`
        .toLowerCase()
        .includes(keyword)
    );
  }, [savedRecords, recordSearch]);

  const checkSupabaseConnection = async () => {
    if (!supabase) {
      setConnectionStatus("disconnected");
      setStatusMessage(
        "Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
      );
      return false;
    }

    try {
      const { error } = await supabase.from(SUPABASE_TABLE).select("id").limit(1);
      if (error) throw error;
      setConnectionStatus("connected");
      return true;
    } catch {
      setConnectionStatus("disconnected");
      setStatusMessage("Cannot load from Supabase. Check your env keys and table setup.");
      return false;
    }
  };

  useEffect(() => {
    async function loadRecords() {
      const connected = await checkSupabaseConnection();
      if (!connected) return;

      try {
        const { data, error } = await supabase
          .from(SUPABASE_TABLE)
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        const records = data.map(fromDatabaseRow);
        setSavedRecords(records);
        setStatusMessage(records.length ? "" : "No records yet. Encode and save a form to see it here.");
      } catch {
        setConnectionStatus("disconnected");
        setStatusMessage("Cannot load from Supabase. Check your env keys and table setup.");
      }
    }

    loadRecords();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsBooting(false);
    }, 1400);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (activeTab === "computation" && !showComputationTab) {
      setActiveTab("entry");
    }
  }, [activeTab, showComputationTab]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const updateEditField = (event) => {
    const { name, value } = event.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const saveRecord = async () => {
    if (!form.name.trim()) return;
    if (!supabase) {
      setStatusMessage("Supabase is not configured.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .insert({
          application_data: toDatabaseRecord(form),
        })
        .select("*")
        .single();

      if (error) throw error;
      const record = fromDatabaseRow(data);
      setSavedRecords((prev) => [record, ...prev]);
      setStatusMessage("");
      setActiveTab("records");
    } catch {
      setStatusMessage("Failed to save record in Supabase.");
    }
  };

  const clearForm = () => setForm(APPLICATION_TEMPLATE);

  const openRecord = (record, targetTab = "recordView") => {
    setSelectedRecordId(record.id);
    setEditForm({ ...record });
    setPaymentEntry({
      date: "",
      amount: "",
      notes: "",
    });
    setActiveTab(targetTab);
  };

  const saveRecordEdits = async () => {
    if (!selectedRecordId) return;
    if (!supabase) {
      setStatusMessage("Supabase is not configured.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .update({
          application_data: toDatabaseRecord(editForm),
        })
        .eq("id", selectedRecordId)
        .select("*")
        .single();

      if (error) throw error;
      const updatedRecord = fromDatabaseRow(data);

      setSavedRecords((prev) =>
        prev.map((record) => (record.id === selectedRecordId ? updatedRecord : record))
      );
      setStatusMessage("");
      setActiveTab("recordView");
    } catch {
      setStatusMessage("Failed to update record in Supabase.");
    }
  };

  const deleteRecord = async (id) => {
    if (!supabase) {
      setStatusMessage("Supabase is not configured.");
      return;
    }

    try {
      const { error } = await supabase.from(SUPABASE_TABLE).delete().eq("id", id);
      if (error) throw error;

      setSavedRecords((prev) => prev.filter((record) => record.id !== id));
      if (selectedRecordId === id) {
        setSelectedRecordId("");
        setEditForm(APPLICATION_TEMPLATE);
        setActiveTab("records");
      }
      setStatusMessage("");
    } catch {
      setStatusMessage("Failed to delete record in Supabase.");
    }
  };

  const updatePaymentEntry = (event) => {
    const { name, value } = event.target;
    setPaymentEntry((prev) => ({ ...prev, [name]: value }));
  };

  const addPaymentToSelectedRecord = async () => {
    if (!selectedRecordId || !selectedRecord || !paymentEntry.date || !paymentEntry.amount) return;
    if (!supabase) {
      setStatusMessage("Supabase is not configured.");
      return;
    }

    const newPayment = {
      id: `${Date.now()}`,
      date: paymentEntry.date,
      amount: toNumber(paymentEntry.amount),
      notes: paymentEntry.notes?.trim() || "",
      encodedAt: new Date().toISOString(),
    };

    const updatedPaymentLogs = [...(selectedRecord.paymentLogs || []), newPayment];
    const updatedPayload = {
      ...selectedRecord,
      paymentLogs: updatedPaymentLogs,
    };

    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .update({
          application_data: toDatabaseRecord(updatedPayload),
        })
        .eq("id", selectedRecordId)
        .select("*")
        .single();

      if (error) throw error;
      const updatedRecord = fromDatabaseRow(data);
      setSavedRecords((prev) =>
        prev.map((record) => (record.id === selectedRecordId ? updatedRecord : record))
      );
      setPaymentEntry({
        date: "",
        amount: "",
        notes: "",
      });
      setStatusMessage("");
    } catch {
      setStatusMessage("Failed to save payment entry.");
    }
  };

  const requestAdminAccess = () => {
    setAdminPasscodeInput("");
    setShowAdminPasscode(false);
    setAdminAccessError("");
    setShowAdminModal(true);
  };

  const closeAdminAccessModal = () => {
    setShowAdminModal(false);
    setAdminPasscodeInput("");
    setShowAdminPasscode(false);
    setAdminAccessError("");
  };

  const submitAdminAccess = (event) => {
    event.preventDefault();
    if (!adminPasscodeInput.trim()) {
      setAdminAccessError("Please enter admin passcode.");
      return;
    }

    if (adminPasscodeInput === ADMIN_PASSCODE) {
      setIsAdmin(true);
      setActiveTab("entry");
      setStatusMessage("");
      closeAdminAccessModal();
      return;
    }

    setAdminAccessError("Invalid admin passcode.");
  };

  const exitAdminMode = () => {
    setIsAdmin(false);
    setActiveTab("intro");
    setSelectedRecordId("");
    setEditForm(APPLICATION_TEMPLATE);
    setPaymentEntry({
      date: "",
      amount: "",
      notes: "",
    });
  };

  if (isBooting) {
    return (
      <main className="boot-screen">
        <div className="boot-card">
          <div className="boot-logo">A&amp;G</div>
          <h1>A&amp;G Financial Services</h1>
          <p>Preparing your lending dashboard...</p>
          <div className="boot-progress">
            <span />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="header">
        <h1>A&amp;G Financial Services</h1>
        <p>Lending System - Application Encoding and Loan Computation</p>
        {SHOW_CONNECTION_DEBUG && (
          <div className="header-meta">
            <span className={`badge ${connectionStatus}`}>DB: {connectionStatus}</span>
            <button type="button" className="link-btn" onClick={checkSupabaseConnection}>
              Test Connection
            </button>
          </div>
        )}
        {statusMessage && <small className="status">{statusMessage}</small>}
      </header>

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <h3>Dashboard</h3>
          <p>{isAdmin ? "Admin workspace" : "Public view"}</p>
          <nav className="tabs">
            <button
              type="button"
              className={activeTab === "intro" ? "active" : ""}
              onClick={() => setActiveTab("intro")}
            >
              Home
            </button>
            {isAdmin && (
              <>
                <button
                  type="button"
                  className={activeTab === "entry" ? "active" : ""}
                  onClick={() => setActiveTab("entry")}
                >
                  Application Entry
                </button>
                <button
                  type="button"
                  className={activeTab === "computation" ? "active" : ""}
                  onClick={() => setActiveTab("computation")}
                  disabled={!showComputationTab}
                  title={
                    showComputationTab
                      ? "Open computation sheet"
                      : "Enter Amount of Loan Applied and Term first"
                  }
                >
                  Computation Sheet
                </button>
                <button
                  type="button"
                  className={activeTab === "records" ? "active" : ""}
                  onClick={() => setActiveTab("records")}
                >
                  Saved Records ({savedRecords.length})
                </button>
                {selectedRecord && (
                  <>
                    <button
                      type="button"
                      className={activeTab === "recordView" ? "active" : ""}
                      onClick={() => setActiveTab("recordView")}
                    >
                      View Saved Sheet
                    </button>
                    <button
                      type="button"
                      className={activeTab === "recordEdit" ? "active" : ""}
                      onClick={() => setActiveTab("recordEdit")}
                    >
                      Edit Saved Form
                    </button>
                  </>
                )}
                <button type="button" className="ghost-admin-btn" onClick={exitAdminMode}>
                  Exit Admin
                </button>
              </>
            )}
          </nav>
          <div className="sidebar-metrics">
            <article>
              <span>Mode</span>
              <strong>{isAdmin ? "Admin" : "Guest"}</strong>
            </article>
            <article>
              <span>Saved Records</span>
              <strong>{savedRecords.length}</strong>
            </article>
            <article>
              <span>Selected Borrower</span>
              <strong>{selectedRecord?.name || "-"}</strong>
            </article>
          </div>
        </aside>

        <section className="dashboard-main">
      {activeTab === "intro" && (
        <section className="card">
          <h2>Home</h2>
          <p className="hint">
            You will receive a printable form to be completed and submitted for processing.
          </p>
          <section className="printable-section">
            <h4>Authorization</h4>
            <p className="printable-note">
              I confirm that the information provided is true and correct to the best of my knowledge.
              I understand that any false statement may be grounds for denial of this loan
              application. I authorize A&amp;G Financial to disclose and verify information as may be
              required for processing.
            </p>
          </section>
          <section className="printable-section">
            <h4>Loan Notes</h4>
            <p className="printable-note">
              For value received, the borrower promises to pay A&amp;G Financial the approved loan
              amount, plus interest and applicable charges, based on the agreed payment terms.
            </p>
          </section>
          <div className="actions">
            {!isAdmin ? (
              <button type="button" onClick={requestAdminAccess}>
                Admin Access
              </button>
            ) : (
              <button type="button" onClick={() => setActiveTab("entry")}>
                Continue to Application Entry
              </button>
            )}
          </div>
        </section>
      )}

      {isAdmin && activeTab === "entry" && (
        <section className="card">
          <h2>Individual Loan Application Encoder</h2>
          <p className="hint">
            Encode details using the same printable form layout.
          </p>
          {!showComputationTab && (
            <p className="hint">
              Computation Sheet will appear after you enter Amount of Loan Applied and Term of Loan.
            </p>
          )}
          <PrintableApplicationForm values={form} onChange={updateField} />

          <div className="actions">
            <button type="button" onClick={saveRecord}>
              Save Encoded Form
            </button>
            <button type="button" className="ghost" onClick={clearForm}>
              Clear Form
            </button>
          </div>
        </section>
      )}

      {isAdmin && activeTab === "computation" && showComputationTab && (
        <ScheduleSection title="Loan Computation (Live Entry)" schedule={schedule} values={form} />
      )}

      {isAdmin && activeTab === "records" && (
        <section className="card">
          <h2>Saved Application Records</h2>
          <div className="record-search">
            <input
              type="text"
              value={recordSearch}
              onChange={(event) => setRecordSearch(event.target.value)}
              placeholder="Search borrower name, nickname, or phone..."
            />
          </div>
          {savedRecords.length === 0 ? (
            <p className="hint">{statusMessage || "No records yet. Encode and save a form to see it here."}</p>
          ) : filteredRecords.length === 0 ? (
            <p className="hint">No borrower matched your search.</p>
          ) : (
            <ul className="records">
              {filteredRecords.map((record) => {
                const borrowerSchedule = buildSchedule(record);
                const borrowerPaid = (record.paymentLogs || []).reduce(
                  (sum, entry) => sum + toNumber(entry.amount),
                  0
                );
                const borrowerOwes = Math.max(borrowerSchedule.totalPaid - borrowerPaid, 0);

                return (
                <li key={record.id}>
                  <h3>{record.name}</h3>
                  <p>
                    Applied: {formatCurrency(toNumber(record.amountApplied))} | Term: {record.termValue}{" "}
                    {record.termUnit} | Mode: {record.paymentFrequency}
                  </p>
                  <p>
                    Paid so far: {formatCurrency(borrowerPaid)} | Remaining balance:{" "}
                    {formatCurrency(borrowerOwes)}
                  </p>
                  <p>
                    Encoded: {formatDate(record.createdAt)} | Contact: {record.phone || "-"}
                  </p>
                  <div className="record-actions">
                    <button type="button" onClick={() => openRecord(record, "recordView")}>View Sheet</button>
                    <button type="button" onClick={() => openRecord(record, "recordEdit")}>Edit</button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => deleteRecord(record.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {isAdmin && activeTab === "recordView" && (
        selectedRecord && selectedSchedule ? (
          <>
            <section className="card">
              <h2>Saved Record: {selectedRecord.name}</h2>
              <p className="hint">
                This matches the computation-style table in your reference sheet.
              </p>
              <div className="summary-grid">
                <article>
                  <span>Lender Name</span>
                  <strong>{selectedRecord.lenderName || "-"}</strong>
                </article>
                <article>
                  <span>Date Release</span>
                  <strong>{formatDate(selectedRecord.releaseDate) || "-"}</strong>
                </article>
                <article>
                  <span>Interest Rate</span>
                  <strong>{selectedRecord.interestRate || "0"}%</strong>
                </article>
                <article>
                  <span>Mode of Payment</span>
                  <strong>{selectedRecord.paymentFrequency}</strong>
                </article>
                <article>
                  <span>Total Already Paid</span>
                  <strong>{formatCurrency(totalActualPaid)}</strong>
                </article>
                <article>
                  <span>Remaining Balance</span>
                  <strong>{formatCurrency(remainingBalance)}</strong>
                </article>
              </div>
            </section>
            <section className="card">
              <h2>Payment Updates</h2>
              <p className="hint">Encode each payment by date so you can track remaining balance.</p>
              <div className="payment-entry-grid">
                <label>
                  <span>Payment Date</span>
                  <input
                    type="date"
                    name="date"
                    value={paymentEntry.date}
                    onChange={updatePaymentEntry}
                  />
                </label>
                <label>
                  <span>Amount Paid</span>
                  <input
                    type="text"
                    name="amount"
                    value={paymentEntry.amount}
                    onChange={updatePaymentEntry}
                    placeholder="e.g. 600"
                  />
                </label>
                <label>
                  <span>Notes</span>
                  <input
                    type="text"
                    name="notes"
                    value={paymentEntry.notes}
                    onChange={updatePaymentEntry}
                    placeholder="Optional"
                  />
                </label>
              </div>
              <div className="actions">
                <button type="button" onClick={addPaymentToSelectedRecord}>
                  Save Payment Update
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount Paid</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPaymentLogs.length === 0 ? (
                      <tr>
                        <td colSpan={3}>No payment updates yet.</td>
                      </tr>
                    ) : (
                      selectedPaymentLogs.map((payment) => (
                        <tr key={payment.id}>
                          <td>{formatDate(payment.date)}</td>
                          <td>{formatCurrency(toNumber(payment.amount))}</td>
                          <td>{payment.notes || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <ScheduleSection
              title="Saved Loan Computation Sheet"
              schedule={selectedSchedule}
              values={selectedRecord}
            />
          </>
        ) : (
          <section className="card">
            <p className="hint">Select a saved record first from Saved Records tab.</p>
          </section>
        )
      )}

      {isAdmin && activeTab === "recordEdit" && (
        selectedRecord ? (
          <section className="card">
            <h2>Edit Saved Application</h2>
            <p className="hint">Update details, then click Save Changes.</p>
            <div className="grid">{renderFormFields(editForm, updateEditField)}</div>
            <div className="actions">
              <button type="button" onClick={saveRecordEdits}>Save Changes</button>
              <button type="button" className="ghost" onClick={() => setActiveTab("recordView")}>
                Cancel
              </button>
            </div>
            <ScheduleSection title="Updated Computation Preview" schedule={editSchedule} values={editForm} />
          </section>
        ) : (
          <section className="card">
            <p className="hint">Select a saved record first from Saved Records tab.</p>
          </section>
        )
      )}
        </section>
      </div>
      {showAdminModal && (
        <div className="admin-modal-overlay" role="presentation" onClick={closeAdminAccessModal}>
          <div
            className="admin-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-access-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="admin-access-title">Admin Access</h3>
            <p>Enter passcode to open admin tools.</p>
            <form onSubmit={submitAdminAccess} className="admin-modal-form">
              <label>
                <span>Passcode</span>
                <div className="admin-passcode-input-wrap">
                  <input
                    type={showAdminPasscode ? "text" : "password"}
                    value={adminPasscodeInput}
                    onChange={(event) => {
                      setAdminPasscodeInput(event.target.value);
                      if (adminAccessError) setAdminAccessError("");
                    }}
                    placeholder="Enter admin passcode"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="passcode-toggle-btn"
                    onClick={() => setShowAdminPasscode((prev) => !prev)}
                  >
                    {showAdminPasscode ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              {adminAccessError && <small className="admin-error-text">{adminAccessError}</small>}
              <div className="admin-modal-actions">
                <button type="submit">Open Admin</button>
                <button type="button" className="ghost" onClick={closeAdminAccessModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
