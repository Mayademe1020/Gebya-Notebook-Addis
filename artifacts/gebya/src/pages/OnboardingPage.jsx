import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export interface OnboardingPageProps {
  className?: string;
}

export function OnboardingPage({ className }: OnboardingPageProps) {
  const navigate = useNavigate();
  const [selectedAccountType, setSelectedAccountType] = useState<string | null>(null);
  const [isLanguageEnglish, setIsLanguageEnglish] = useState(false);

  const accountTypes = [
    {
      id: 'owner',
      title: isLanguageEnglish ? 'Shop Owner / Employer' : 'የሱቅ ባለቤት / አሰሪ ነኝ',
      description: isLanguageEnglish
        ? 'Record your shop data and manage your sales staff'
        : 'የራስዎን የሱቅ መረጃ ለመመዝገብ እና ሰራተኞችን ለማስገባት',
      icon: isLanguageEnglish ? '🏪' : '🏪',
      imageUrl: isLanguageEnglish
        ? 'https://images.unsplash.com/photo-1556740749-885e1a5b8e9b?w=400'
        : 'https://images.unsplash.com/photo-1526745321394-8c8f0e3b2d6b?w=400',
      features: isLanguageEnglish
        ? [
            'Track sales and inventory',
            'Manage customers and suppliers',
            'Generate daily reports',
            'Access from any device',
          ]
        : [
            'ሽያጭና መረጃ ማቆጫዎ',
            'ሰራተኞች እና ደንባናት ማቆጫዎ',
            'ዕለ መረጃ ለመመጥር',
            'በማኑት ላይ ለመመጥር',
          ],
    },
    {
      id: 'staff',
      title: isLanguageEnglish ? 'Sales Staff' : 'አሰሪ ወደ ሱቅ ተጋብደለሁ',
      description: isLanguageEnglish
        ? 'View sales data and collect payments'
        : 'በዘገብ ውስጥ ሚዜቶ በቅርቡአዊው እና በመመጥር ሚዜቶ ይመረጃቡም',
      icon: isLanguageEnglish ? '👥' : '👥',
      imageUrl: isLanguageEnglish
        ? 'https://images.unsplash.com/photo-1521747716927-712215148e1b?w=400'
        : 'https://images.unsplash.com/photo-1531116988465-5a2a3f8e8b3e?w=400',
      features: isLanguageEnglish
        ? [
            'View daily sales',
            'Process customer payments',
            'Track collections',
            'Send payment reminders',
          ]
        : [
            'ዕለ-ቲድ ሚዜቶ መረጃ መረጃትዎ',
            'ደብት በመመጥርና ክፍያ ማቅረብ',
            'ሚዜቶ ሞልስት መረጃህደም እናመመጥር',
            'ደብት መሰናክማሽ ትዋል',
          ],
    },
    {
      id: 'quickstart',
      title: isLanguageEnglish ? 'Quick Start' : 'በተውጥር ሊረመም',
      description: isLanguageEnglish
        ? 'Get started quickly with your shop'
        : 'የሱቅ መረጃ በተውጥር ሊረመም ተመመበት',
      icon: isLanguageEnglish ? '⚡' : '⚡',
      imageUrl: isLanguageEnglish
        ? 'https://images.unsplash.com/photo-1559628231-e3590c37b0b0?w=400'
        : 'https://images.unsplash.com/photo-1516321251545-2701743e8e08?w=400',
      features: isLanguageEnglish
        ? [
            'One-time setup in 5 minutes',
            'All essential tools included',
            'Mobile-optimized interface',
            'Works offline',
          ]
        : [
            'አንድ ዋጅ ሊሆመ በመመጥር 5 ደብት',
            'ሁሉነት አስገበዎ መመጥር ተካላቾቷ',
            'ስላች አንድት የኢንተርኔት መመጥር',
            'መመጥር ሊን|ጥታዊክ በተቻለ ገመልና ውስብ መረጃ🏾ን ይመረጃት።',
          ],
    },
  ];

  const toggleLanguage = () => {
    setIsLanguageEnglish(!isLanguageEnglish);
  };

  const handleAccountTypeSelect = (accountTypeId: string) => {
    setSelectedAccountType(accountTypeId);
  };

  const handleContinue = () => {
    if (selectedAccountType) {
      navigate(`/onboarding/${selectedAccountType}`);
    }
  };

  const getActionText = () => {
    if (selectedAccountType === 'owner') {
      return isLanguageEnglish ? 'Create Shop' : 'ሱቅ መቅር';
    } else if (selectedAccountType === 'staff') {
      return isLanguageEnglish ? 'Join Shop' : 'በሱቅ ይገባበኝ';
    } else {
      return isLanguageEnglish ? 'Get Started' : 'ዊረመም ተመመበት';
    }
  };

  const getTagline = () => {
    if (isLanguageEnglish) {
      return 'Your Shop Notebook';
    }
    return 'የሱቅ መፈክር';
  };

  const getDescription = () => {
    if (isLanguageEnglish) {
      return 'Choose the account type that best fits you and get started with your digital notebook today.';
    }
    return 'አንድ መገኙህ መጻዋመና መጻረኡ, በሁሉም ውስብ ተሸፋማሪ ሁቫወመች እና መመጥር ይመረጃቱ።';
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 py-12 px-4 sm:px-6 lg:px-8 ${className}`}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="bg-green-600 p-4 rounded-2xl shadow-lg">
              <span className="text-4xl">🏪</span>
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Gebya</h1>
          <p className="text-xl text-gray-600 font-medium mb-2">{getTagline()}</p>
          <p className="text-gray-500 max-w-2xl mx-auto">
            {getDescription()}
          </p>
        </div>

        <div className="flex justify-end mb-8">
          <button
            onClick={toggleLanguage}
            className="px-4 py-2 bg-white rounded-full shadow-sm hover:shadow-md transition-shadow flex items-center gap-2"
          >
            <span className="text-sm font-medium">
              {isLanguageEnglish ? 'አማርኛ' : 'English'}
            </span>
            <span className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-sm">🌐</span>
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {accountTypes.map((type) => (
            <div
              key={type.id}
              onClick={() => handleAccountTypeSelect(type.id)}
              className={`cursor-pointer group transform transition-all duration-200 hover:scale-105 ${
                selectedAccountType === type.id
                  ? 'ring-2 ring-green-500 bg-green-50/50'
                  : 'bg-white hover:bg-gray-50'
              } rounded-2xl p-6 shadow-md hover:shadow-xl border border-gray-200`}
            >
              <div className="relative mb-6">
                <div className="w-16 h-16 mx-auto bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl flex items-center justify-center text-3xl mb-4 group-hover:from-green-200 group-hover:to-emerald-200 transition-colors">
                  <span>{type.icon}</span>
                </div>
                <img
                  src={type.imageUrl}
                  alt={type.title}
                  className="w-full h-32 object-cover rounded-xl mb-4 opacity-90 group-hover:opacity-100 transition-opacity"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-green-700 transition-colors">
                {type.title}
              </h3>
              <p className="text-gray-600 mb-4 leading-relaxed">
                {type.description}
              </p>
              <ul className="space-y-2">
                {type.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span className="text-sm text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={handleContinue}
            disabled={!selectedAccountType}
            className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95 ${
              selectedAccountType
                ? 'bg-green-600 hover:bg-green-700 text-white cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {getActionText()}
          </button>
        </div>
      </div>
    </div>
  );
}
