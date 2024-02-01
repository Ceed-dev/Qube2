import React, { useState } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion"; // Framer Motionを使用する場合
import { textVariant } from "../../utils";
import Link from "next/link";
import { waitlistUrl } from "../../constants";
import { ArrowIconForFaq } from "../../assets";
import Image from "next/image";

const FAQ = () => {
  const router = useRouter();

  const faqs = [
    {
      question: "どのチェーンに対応していますか？",
      answer: "現在はPolygonのみの対応になってますが、順次他のチェーン対応予定です。ご要望のチェーン等あればお問い合わせフォームよりご相談ください。",
    },
    {
      question: "もしインフルエンサーが仕事をしなかった場合どうなりますか？",
      answer: "「インフルエンサーが仕事をしない」や「契約通りの納品ができない」場合は自動で返金手続きに進む仕様になっています。詳細についてはお問い合わせフォームより気軽にご相談ください。",
    },
    {
      question: "インフルエンサーの仕事が求められた水準に満たなかった場合の対応措置はありますか？",
      answer: "成果物の契約時の水準を満たない場合は、契約時に決めた水準までの仕事を再度するよに契約期間の更新やエスクローに預けた資金の返金手続きを取ることができます。",
    },
    {
      question: "途中で契約が破棄になった場合預けたお金はどうなりますか？",
      answer: "返金手続きを取り次第お金が戻ってきますのでご安心ください。",
    },
    {
      question: "サービスに関しての聞きたいことがある場合はどうすればいいですか？",
      answer: "お問合せフォームより気軽にご相談ください。",
    }
  ];

  const faqsForAgent = [
    {
      question: "料金はどれくらいかかりますか？",
      answer: "料金は内容によって大きく左右するので、まずは一度お話をお聞かせください。",
    },
    {
      question: "どのようなインフルエンサーを抱えていますか？",
      answer: "企画に合わせて最適なインフルエンサーをご紹介いたしますので、一度お話を伺わせてください。",
    }
  ];

  const [activeIndex, setActiveIndex] = useState(null);

  const toggleFAQ = (index) => {
    if (activeIndex === index) {
      setActiveIndex(null);
    } else {
      setActiveIndex(index);
    }
  };

  return (
    <div id="faqs" className="bg-white py-20 px-40">
      <h1 className="text-center font-bold text-5xl py-20">FAQ</h1>
      {(router.pathname === "/" ? faqs : faqsForAgent).map((faq, index) => (
        <div key={index} className="mb-5">
          <motion.div
            className="cursor-pointer xl:text-2xl lg:text-xl text-lg flex justify-between"
            onClick={() => toggleFAQ(index)}
            initial={{ scale: 1 }}
            whileHover={{ scale: 1.05 }}
          >
            {faq.question}
            <Image src={ArrowIconForFaq} alt="arrow" />
          </motion.div>
          {activeIndex === index && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="xl:text-lg text-md"
            >
              {faq.answer}
              {router.pathname === "/agent" && 
                <Link 
                  href="https://docs.google.com/forms/d/e/1FAIpQLScds_7cNpaP777tQf910xgbd_ciFfZC9likpocEDzkPonWBrw/viewform" 
                  target="_blank"
                  className="text-blue-500 hover:underline"
                >
                  問い合わせフォーム
                </Link>
              }
            </motion.p>
          )}
        </div>
      ))}
    </div>
  );
};

export default FAQ;
