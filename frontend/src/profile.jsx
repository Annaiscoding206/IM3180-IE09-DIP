import React from "react";
import "./styles.css";

const curriculum = [
	{ year: 1, code: "MH1810", name: "Mathematics 1", type: "Core", au: 3 },
	{ year: 1, code: "IE1005", name: "From Computational Thinking to Programming", type: "Core", au: 3 },
	{ year: 1, code: "DA1000", name: "Thinking & Communicating Visually", type: "Core", au: 3 },
	{ year: 1, code: "IM1002", name: "Analog Electronics", type: "Core", au: 3 },
	
	{ year: 2, code: "IE2108", name: "Data Structures and Algorithms", type: "Core", au: 3 },
	{ year: 2, code: "IE2104", name: "Digital Electronics", type: "Core", au: 3 },
	{ year: 2, code: "IE2106", name: "Engineering Mathematics 1", type: "Core", au: 3 },
	{ year: 2, code: "IM2073", name: "Introduction to Design and Project", type: "Core", au: 2 },
	
	{ year: 3, code: "IM3180", name: "Design & Innovation Project", type: "Core", au: 3 },
	{ year: 3, code: "IE3014", name: "Digital Signal Processing", type: "Core", au: 3 },
	{ year: 3, code: "IE3017", name: "Computer Communications", type: "Core", au: 3 },
	{ year: 3, code: "DA3000", name: "Thinking & Communicating Visually III", type: "Core", au: 3 },
	
	{ year: 4, code: "IE4001", name: "Software Engineering", type: "Core", au: 3 },
	{ year: 4, code: "IE4080", name: "Final Year Project", type: "Core", au: 8 },

]

export default function StudentProfile({ student, semester, academicYear, courses=[]}) {

const academicRecords = student?.degree_audit ?? [];
const CurriculumRecords = student?.programme_curriculum ?? [];
return(
	    <div style={{ padding: "14px" }}>
      <section className="hero">
	  <div>
	  <p className = "eyebrow">
	    Semester {semester} · AY {academicYear}
	  </p>
	  
	  <h1>Student Profile</h1>
	  
	  <p className="hero-copy">
	  View your academic details, degree audit
      and programme curriculum.
	  </p>
	  
	  </div>
	  </section>
	  
	  <section
		className="filter-panel"
		style={{ display: "block", marginBottom: "24px" , padding: "24px"}}
		>
		<h2 style={{ margin: "0 0 16px" }}>
			Personal Information
		</h2>
		
		<div style = {{
			display:"flex",
			alignItems: "center",
			gap: "30px",
			flexWrap: "wrap",
		}}
		> 
		<img 
		src="/profile_template.png" 
		alt="Student profile"
		style ={{
			width: "150px",
			height: "150px",
			borderRadius: "50%",
			objectFit: "cover",
			border:"2px solid var(--line)",
		}}
		/>

		</div>
		
		
		<dl className="requirements" style={{ margin: 0 }}>

		<div>
			<dt>Full Name</dt>
			<dd>{student?.student_name || "—"}</dd>
		</div>

		<div>
			<dt>Student ID</dt>
			<dd>{student?.student_id || "—"}</dd>
		</div>

		<div>
			<dt>Programme</dt>
			<dd>{student?.programme || "—"}</dd>
		</div>

		<div>
			<dt>Study Year</dt>
			<dd>
				{student?.study_year
				? `Year ${student.study_year}`
				: "—"}
			</dd>
		</div>

  </dl>
</section>

      <section
		className="filter-panel"
		style={{
		display: "block",
		padding: "24px",
		marginBottom: "24px",
  }}
	  >
	  <p className="eyebrow">
		ACADEMIC RECORD
	  </p>
	  <h2 style={{ margin: "0 0 10px" }}>
		Degree Audit
	  </h2>
	  
	  <p style={{ color: "var(--muted)" }}>
	  
	  </p>
	  
	  <div style={{ overflowX: "auto", marginTop: "20px" }}>
	  
	  <table
	  style ={{
			width: "100%",
			minWidth: "600px",
			borderCollapse: "collapse",
			textAlign: "left",
			colour:"var(--ink)",
		}}
	  >
	  <thead>
	  
	  <tr>
		<th>Course Code</th>
		<th>Course Name</th>
		<th>AU</th>
		<th>Grade</th>
	  </tr>
	  
	  </thead>
	  
	  <tbody>
	  {academicRecords.map((record) => (
	  <tr key={record.course_code}>
	  
	  
	  <td>{record.course_code}</td>
	  
	  <td>{record.course_title}</td>
	  
	  <td>{record.au}</td>
	  
	  <td>{record.grade}</td>
	  
	  </tr>
	  
	  ))}
	  </tbody>
	  
	  </table>
	  
	  
	  </div>
	  
	  </section>
	  
	  <section
		className="filter-panel"
		style={{
		display: "block",
		padding: "24px",
		marginBottom: "24px",
  }}
	  >
	  <p className="eyebrow">
		Academic Requirements
	  </p>
	  <h2 style={{ margin: "0 0 10px" }}>
		Programme Curriculum
	  </h2>
	  
	  <p style={{ color: "var(--muted)" }}>
	  Bachelor of Engineering (Information Engineering and Media)
	  </p>
	  
	  <div style={{ overflowX: "auto", marginTop: "20px" }}>
	  
	  <table
	  style ={{
			width: "100%",
			minWidth: "600px",
			borderCollapse: "collapse",
			textAlign: "left",
			colour:"var(--ink)",
		}}
	  >
	  
	  	  <thead>
	  
	  <tr>
		<th>Programme</th>
		<th>Course Code</th>
		<th>Course Name</th>
		<th>Course Year</th>
		<th>Semester</th>
		<th>Type</th>
		<th>AU</th>
		<th>Prerequisite Note</th>
	  </tr>
	  
	  </thead>
	  
	  <tbody>
	  {CurriculumRecords.map((record2) => (
	  <tr key={record2.course_code}>
	  
	  <td>{record2.programme}</td>
	  
	  <td>{record2.course_code}</td>
	  
	  <td>{record2.course_name}</td>
	  
	  <td>{record2.course_year}</td>
	  
	  <td>{record2.course_semester}</td>
	  
	  <td>{record2.type_code}</td>
	  
	  <td>{record2.au}</td>
	  
	  <td>{record2.prerequisite_note}</td>
	  
	  </tr>
	  
	  ))}
	  </tbody>
	  
	  
	  
	  </table>
	  
	  
	  </div>
	  
	  </section>
    </div>
);
}

