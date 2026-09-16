\# Git Workflow



\## Main Branch



`main` contains the stable team version of the project.



Do not push unfinished work directly to `main`.



\---



\## Working Branches



Each member develops on a separate branch.



Current example:



\- main

\- anna

\- other team-member branches



As development progresses, feature branches may also be used:



\- feature/student-profile

\- feature/course-explorer

\- feature/eligibility-check

\- feature/timetable-generator



\---



\## Standard Workflow



1\. Pull the latest changes.

2\. Work on a separate branch.

3\. Test changes locally.

4\. Stage and commit the changes.

5\. Push the branch to GitHub.

6\. Create a Pull Request.

7\. Review the changes.

8\. Merge into main.



\---



\## Example



git switch main

git pull origin main



git switch ***'your branch'***



\# make changes



git add .

git commit -m ***"Your comment"***

git push ***'your branch'***



\---



\## Commit Guidelines



Use clear commit messages, for example:



\- Set up project structure

\- Define database schema

\- Add demo student data

\- Implement course API

\- Implement course explorer



\---



\## Files That Must Not Be Committed



\- .env

\- database passwords

\- node\_modules/

\- generated build files

