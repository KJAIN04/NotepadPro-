
// File: src/App.js

import { useState, useEffect } from 'react';
import AddTaskForm from './components/AddTaskForm.jsx';
import UpdateForm from './components/UpdateForm.jsx';
import ToDo from './components/ToDo.jsx';
import AWS from 'aws-sdk';
import { CognitoUserPool, AuthenticationDetails, CognitoUser } from 'amazon-cognito-identity-js';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

// AWS Cognito and S3 Configuration
const poolData = {
  UserPoolId: 'YOUR_USER_POOL_ID',
  ClientId: 'YOUR_CLIENT_ID',
};
const userPool = new CognitoUserPool(poolData);
const identityPoolId = 'YOUR_IDENTITY_POOL_ID';
const region = 'YOUR_AWS_REGION';
const bucketName = 'your-bucket-name';

// Configure AWS S3
AWS.config.update({
  region: region,
});

const s3 = new AWS.S3();

function App() {
  const [toDo, setToDo] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState(''); // Store due date and time
  const [newTaskRepetition, setNewTaskRepetition] = useState('none'); // Repetition pattern
  const [updateData, setUpdateData] = useState('');
  const [userId, setUserId] = useState(null); // Store logged-in user ID

  // Timer to check tasks every minute
  useEffect(() => {
    authenticateUser();
    const timer = setInterval(checkTasksDue, 60000); // Check every 60 seconds
    return () => clearInterval(timer); // Clean up timer when component unmounts
  }, [toDo]);

  const authenticateUser = () => {
    const username = 'user@example.com'; // Replace with form input
    const password = 'user-password'; // Replace with form input

    const authenticationDetails = new AuthenticationDetails({
      Username: username,
      Password: password,
    });

    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: userPool,
    });

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (session) => {
        const idToken = session.getIdToken().getJwtToken();
        const userId = session.getIdToken().payload.sub; // Get the unique Cognito user ID
        setUserId(userId);

        // Configure AWS credentials using the Cognito Identity Pool
        AWS.config.credentials = new AWS.CognitoIdentityCredentials({
          IdentityPoolId: identityPoolId,
          Logins: {
            [`cognito-idp.${region}.amazonaws.com/${poolData.UserPoolId}`]: idToken,
          },
        });

        // Fetch tasks from S3 after successful authentication
        fetchTasksFromS3(userId);
      },
      onFailure: (err) => {
        console.error('Authentication failed:', err);
      },
    });
  };

  // Fetch tasks from S3 bucket for the logged-in user
  const fetchTasksFromS3 = async (userId) => {
    try {
      const params = {
        Bucket: bucketName,
        Key: `user-tasks/${userId}.json`,
      };
      const data = await s3.getObject(params).promise();
      const tasks = JSON.parse(data.Body.toString());
      setToDo(tasks);
    } catch (err) {
      console.error('Error fetching tasks from S3:', err);
    }
  };

  // Save tasks to S3 for the logged-in user
  const saveTasksToS3 = async (tasks) => {
    if (!userId) return;
    try {
      const params = {
        Bucket: bucketName,
        Key: `user-tasks/${userId}.json`,
        Body: JSON.stringify(tasks),
        ContentType: 'application/json',
      };
      await s3.putObject(params).promise();
    } catch (err) {
      console.error('Error saving tasks to S3:', err);
    }
  };

  // Add task
  const addTask = async () => {
    if (newTask) {
      const num = toDo.length + 1;
      const newEntry = {
        id: num,
        title: newTask,
        status: false,
        dueDate: new Date(newTaskDueDate).toISOString(),
        repetition: newTaskRepetition,
      };
      const updatedToDo = [...toDo, newEntry];
      setToDo(updatedToDo);
      setNewTask('');
      setNewTaskDueDate('');
      setNewTaskRepetition('none');

      // Save the updated list to S3
      await saveTasksToS3(updatedToDo);
    }
  };

  // Delete task
  const deleteTask = async (id) => {
    const updatedToDo = toDo.filter((task) => task.id !== id);
    setToDo(updatedToDo);
    await saveTasksToS3(updatedToDo);
  };

  // Mark task as done
  const markDone = async (id) => {
    const updatedToDo = toDo.map((task) =>
      task.id === id ? { ...task, status: !task.status } : task
    );
    setToDo(updatedToDo);
    await saveTasksToS3(updatedToDo);
  };

  // Update task
  const updateTask = async () => {
    const removeOldRecord = toDo.filter((task) => task.id !== updateData.id);
    const updatedToDo = [...removeOldRecord, updateData];
    setToDo(updatedToDo);
    setUpdateData('');
    await saveTasksToS3(updatedToDo);
  };

  // Check if any tasks are due and notify the user
  const checkTasksDue = () => {
    const now = new Date();
    toDo.forEach((task) => {
      const dueDate = new Date(task.dueDate);
      if (dueDate <= now && !task.status) {
        // Task is due, notify the user
        alert(`Task "${task.title}" is due!`);

        // Handle task repetition (daily, weekly, etc.)
        if (task.repetition === 'daily') {
          task.dueDate = new Date(dueDate.setDate(dueDate.getDate() + 1)).toISOString();
        } else if (task.repetition === 'weekly') {
          task.dueDate = new Date(dueDate.setDate(dueDate.getDate() + 7)).toISOString();
        } else if (task.repetition === 'monthly') {
          task.dueDate = new Date(dueDate.setMonth(dueDate.getMonth() + 1)).toISOString();
        }

        // Update the tasks list and save it
        setToDo([...toDo]);
        saveTasksToS3([...toDo]);
      }
    });
  };

  return (
    <div className="container App">
      <br />
      <br />
      <h2>To Do List App with Timers (ReactJS)</h2>
      <br />
      <br />

      {updateData && updateData ? (
        <UpdateForm
          updateData={updateData}
          changeHolder={(e) => setUpdateData({ ...updateData, title: e.target.value })}
          updateTask={updateTask}
          cancelUpdate={() => setUpdateData('')}
        />
      ) : (
        <AddTaskForm
          newTask={newTask}
          setNewTask={setNewTask}
          addTask={addTask}
          newTaskDueDate={newTaskDueDate}
          setNewTaskDueDate={setNewTaskDueDate}
          newTaskRepetition={newTaskRepetition}
          setNewTaskRepetition={setNewTaskRepetition}
        />
      )}

      {toDo.length ? (
        <ToDo toDo={toDo} markDone={markDone} setUpdateData={setUpdateData} deleteTask={deleteTask} />
      ) : (
        'No Tasks...'
      )}
    </div>
  );
}

export default App;
